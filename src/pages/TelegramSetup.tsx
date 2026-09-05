// TelegramSetup — the whole Telegram connection on one page, in order:
// bot connected → inbound pipe open → chat paired → proof it works → what has
// actually landed. Every step says what is true right now and what to do next.
//
// Capture only. Nothing on this page executes anything: pairing, registering
// the pipe and sending a test create no work and approve nothing.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, RefreshCw, Send, ShieldCheck, X, Inbox as InboxIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/state-views";
import { TelegramLinkCard } from "@/components/TelegramLinkCard";
import { TelegramThread } from "@/components/telegram/TelegramThread";
import { vantaToast as toast } from "@/lib/vantaVoice";

type Status = {
  bot_connected: boolean;
  bot: { username: string | null; name: string | null };
  gateway_error: string | null;
  webhook: {
    url?: string | null;
    points_here?: boolean;
    pending_update_count?: number;
    last_error_message?: string | null;
    last_error_at?: string | null;
    allowed_updates?: string[] | null;
  };
  links: { id: string; chat_id: number; tg_username: string | null; linked_at: string }[];
  route: string | null;
  last_in: string | null;
  last_out: string | null;
  last_out_event: string | null;
  recent_inbound: { at: string; event: string; chat_id: number | null; preview: string | null }[];
  recent_captures: {
    at: string;
    destination: string;
    note_id: string | null;
    action_id: string | null;
    commitment_id: string | null;
  }[];
};

const ROUTE_LABEL: Record<string, string> = {
  personal: "Everything lands in your personal lane.",
  ask_each_time: "Vanta asks which lane each time.",
};

function ago(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return null;
  }
}

function Step({
  n, title, done, detail, children,
}: {
  n: number;
  title: string;
  done: boolean;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="vanta-card p-3">
      <div className="flex items-start gap-2.5">
        <span
          className={
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium " +
            (done ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-muted/40 text-muted-foreground ring-1 ring-border/60")
          }
        >
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-medium">{title}</div>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <StatusDot tone={done ? "primary" : "muted"} />
              {done ? "done" : "waiting"}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{detail}</p>
          {children && <div className="mt-2.5">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export default function TelegramSetup() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("telegram-status");
      if (err) throw err;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus(data as Status);
    } catch {
      setError("Couldn't read the Telegram connection just now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const registerInbound = async () => {
    setBusy("register");
    try {
      const { data, error: err } = await supabase.functions.invoke("telegram-register");
      if (err) throw err;
      const d = (data ?? {}) as { registered?: boolean; reason?: string; last_error_message?: string | null };
      if (d.registered) toast.success("Telegram now delivers your messages to Vanta.");
      else toast(d.reason ?? d.last_error_message ?? "Telegram didn't accept the connection.");
      await load();
    } catch (e) {
      toast.fromError(e, "Couldn't open the Telegram connection.");
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    try {
      const { data, error: err } = await supabase.functions.invoke("telegram-test");
      if (err) throw err;
      const d = (data ?? {}) as { sent?: number; failed?: number; errors?: string[]; reason?: string };
      if (d.reason === "no_links") toast("Pair a chat first — step 3 below.");
      else if ((d.sent ?? 0) > 0) toast.success(`Test message delivered to ${d.sent} chat${d.sent === 1 ? "" : "s"}.`);
      else toast(d.errors?.[0] ?? "Telegram didn't accept the message.");
      await load();
    } catch (e) {
      toast.fromError(e, "Test send failed.");
    } finally {
      setBusy(null);
    }
  };

  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;

  const linked = (status?.links.length ?? 0) > 0;
  const inboundOpen = Boolean(status?.webhook?.points_here);
  const proven = Boolean(status?.last_in);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <Link
          to="/settings/g/connections"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">Telegram</h1>
          <p className="text-xs text-muted-foreground">
            Message Vanta from your phone. What you send lands in the Inbox as a draft.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      <div className="mb-4 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-primary" /> Capture layer only
        </div>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Messages become drafts inside Vanta — never live actions. Approving and executing always happens here.
        </p>
      </div>

      {loading && <LoadingState label="Checking the connection" />}
      {error && <ErrorState detail={error} onRetry={() => void load()} />}

      {status && (
        <div className="space-y-3">
          <Step
            n={1}
            title="Your bot is connected"
            done={status.bot_connected && !status.gateway_error}
            detail={
              status.gateway_error
                ? `Telegram answered: ${status.gateway_error}`
                : status.bot.username
                  ? `Talking to @${status.bot.username}. That's the chat to message.`
                  : status.bot_connected
                    ? "A bot key is in place, but Telegram hasn't confirmed the bot yet."
                    : "No bot yet. Connect Telegram in Platform Integrations, then come back here."
            }
          >
            {!status.bot_connected && (
              <Link
                to="/settings/integrations#integration-telegram"
                className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-[11.5px] font-medium text-primary-foreground"
              >
                Connect Telegram
              </Link>
            )}
          </Step>

          <Step
            n={2}
            title="Messages can reach Vanta"
            done={inboundOpen}
            detail={
              inboundOpen
                ? `The pipe is open.${status.webhook.pending_update_count ? ` ${status.webhook.pending_update_count} message(s) waiting to be picked up.` : ""}`
                : "Telegram doesn't know where to deliver your messages yet. Open the pipe once."
            }
          >
            <div className="space-y-2">
              <Button
                size="sm"
                variant={inboundOpen ? "outline" : "default"}
                className="gap-1.5"
                disabled={busy === "register" || !status.bot_connected}
                onClick={() => void registerInbound()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {inboundOpen ? "Open it again" : "Open the pipe"}
              </Button>
              {status.webhook.last_error_message && (
                <div className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  <span>
                    Telegram's last complaint: {status.webhook.last_error_message}
                    {ago(status.webhook.last_error_at) ? ` (${ago(status.webhook.last_error_at)})` : ""}
                  </span>
                </div>
              )}
            </div>
          </Step>

          <Step
            n={3}
            title="A chat is paired to you"
            done={linked}
            detail={
              linked
                ? `${status.links.length} chat${status.links.length === 1 ? "" : "s"} paired. ${
                    status.route
                      ? (ROUTE_LABEL[status.route] ?? `Everything lands in the ${status.route.replace("workspace:", "")} workspace.`)
                      : "Everything lands in your personal lane."
                  }`
                : "Generate a code, send it to your bot, and this chat becomes yours."
            }
          >
            <TelegramLinkCard />
          </Step>

          <Step
            n={4}
            title="Proof it works both ways"
            done={proven}
            detail={
              proven
                ? `Last message in: ${ago(status.last_in)}.${status.last_out ? ` Last message out: ${ago(status.last_out)}.` : ""}`
                : "Nothing has come in yet. Send your bot any message — a note, a photo, a voice note — then refresh."
            }
          >
            <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === "test" || !linked} onClick={() => void sendTest()}>
              <Send className="h-3.5 w-3.5" /> Send myself a test message
            </Button>
          </Step>

          <section className="vanta-card p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                <InboxIcon className="h-3.5 w-3.5 text-primary" /> What has landed
              </div>
              <Link to="/?surface=inbox" className="text-[11.5px] text-primary hover:underline">
                Open Inbox
              </Link>
            </div>
            <p className="mb-2 text-[11.5px] text-muted-foreground">
              Every message Vanta received, and where it filed it. Open the Inbox to act on any of them.
            </p>

            {status.recent_inbound.length === 0 ? (
              <EmptyState
                title="No messages yet"
                hint="Send your bot a line and it shows up here, then in the Inbox as a draft."
              />
            ) : (
              <ul className="space-y-1.5">
                {status.recent_inbound.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="rounded-md bg-muted/25 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {r.event === "telegram.message_in"
                          ? "Message received"
                          : r.event === "telegram.linked"
                            ? "Chat paired"
                            : r.event === "telegram.unlinked"
                              ? "Chat unpaired"
                              : "Button tapped"}
                      </span>
                      <span>{ago(r.at)}</span>
                    </div>
                    {r.preview && <div className="mt-0.5 truncate text-[12px]">{r.preview}</div>}
                  </li>
                ))}
              </ul>
            )}

            {status.recent_captures.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Where they were filed</div>
                <ul className="space-y-1">
                  {status.recent_captures.map((c, i) => (
                    <li key={`${c.at}-${i}`} className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="truncate">
                        {c.destination === "memory"
                          ? "Saved as a note"
                          : c.destination === "actions"
                            ? "Staged as an action, waiting for your approval"
                            : c.destination === "commitments"
                              ? "Recorded as a promise"
                              : c.destination}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{ago(c.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <TelegramThread
            paired={linked}
            chatId={status.links[0]?.chat_id ?? null}
            onSent={() => void load()}
          />

          <p className="text-center text-[11px] text-muted-foreground">
            Kill switches and the rest of the platforms live in{" "}
            <Link to="/settings/integrations" className="underline">Platform Integrations</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
