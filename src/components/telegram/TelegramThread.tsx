// TelegramThread — the actual conversation, inside Vanta.
//
// Three voices, always labelled: what you sent from your phone, what Vanta
// answered, and what you typed here and pushed back to the chat. Sending a
// message is the only thing this does — it never approves, exports or files.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Loader2, Send, Smartphone, Sparkles, User, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, LoadingState } from "@/components/ui/state-views";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { ConfirmConsequenceDialog } from "@/components/ui/consequence-preview";
import { sendReplyConsequence } from "@/lib/consequence";

export type TgMessage = {
  id: string;
  chat_id: number;
  direction: "in" | "out";
  text: string | null;
  kind: string;
  sent_by: string | null;
  error: string | null;
  created_at: string;
};

const KIND_NOTE: Record<string, string> = {
  page: "Photo of a page — read and filed in the Inbox",
  page_reply: "Vanta's answer about that page",
};

function who(m: TgMessage) {
  if (m.direction === "in") return { label: "You, from Telegram", Icon: Smartphone };
  if (m.sent_by === "you") return { label: "You, from Vanta", Icon: User };
  return { label: "Vanta", Icon: Sparkles };
}

export function TelegramThread({
  paired,
  chatId,
  onSent,
}: {
  paired: boolean;
  chatId?: number | null;
  onSent?: () => void;
}) {
  const { user, session } = useAuth();
  const [rows, setRows] = useState<TgMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /* A reply leaves Vanta and can't be recalled, so it gets a look first. */
  const [confirming, setConfirming] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("telegram_messages")
      .select("id, chat_id, direction, text, kind, sent_by, error, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    setRows(((data ?? []) as unknown as TgMessage[]).slice().reverse());
  }, [user]);

  useEffect(() => {
    if (!session) return;
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [session, load]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows?.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-send", {
        body: { text, chat_id: chatId ?? undefined },
      });
      if (error) throw error;
      const d = (data ?? {}) as { sent?: boolean; reason?: string; error?: string };
      if (!d.sent) {
        toast(d.reason ?? d.error ?? "Telegram didn't accept that message.");
      } else {
        setDraft("");
        toast.success("Sent to your Telegram chat.");
        setConfirming(false);
        onSent?.();
      }
      await load();
    } catch (e) {
      toast.fromError(e, "The message didn't leave Vanta.");
    } finally {
      setSending(false);
    }
  };

  const grouped = useMemo(() => {
    const out: { day: string; items: TgMessage[] }[] = [];
    for (const m of rows ?? []) {
      const d = new Date(m.created_at);
      const last = out[out.length - 1];
      if (last && isSameDay(new Date(last.items[0].created_at), d)) last.items.push(m);
      else out.push({ day: format(d, "EEE d MMM"), items: [m] });
    }
    return out;
  }, [rows]);

  return (
    <section className="vanta-card p-3">
      <ConfirmConsequenceDialog
        open={confirming}
        title="Send this to Telegram?"
        consequence={draft.trim() ? sendReplyConsequence({ channel: "Telegram", to: "your paired chat", text: draft }) : null}
        confirmLabel="Send it"
        busy={sending}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      />
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium">The conversation</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            Everything that has gone between your phone and Vanta. You can answer from
            here — the reply arrives in the same chat. Nothing you type executes.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {rows === null ? (
        <LoadingState label="Reading the thread" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            paired
              ? "Nothing said yet. Send a message to the bot from your phone and it appears here."
              : "Pair a chat first, then messages appear here in order."
          }
          hint="Try: “remind me to call Nikki tomorrow at 9” — it comes back as a draft."
        />
      ) : (
        <div ref={scroller} className="max-h-[420px] space-y-3 overflow-y-auto pr-0.5">
          {grouped.map((g) => (
            <div key={g.day} className="space-y-1.5">
              <div className="sticky top-0 z-10 bg-background/90 py-0.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                {g.day}
              </div>
              {g.items.map((m) => {
                const { label, Icon } = who(m);
                const mine = m.direction === "in" || m.sent_by === "you";
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] min-w-0", mine ? "text-right" : "text-left")}>
                      <div
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground",
                          mine ? "flex-row-reverse" : "",
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                        <span className="normal-case tracking-normal">· {format(new Date(m.created_at), "HH:mm")}</span>
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-left text-[12.5px] leading-snug ring-1",
                          mine
                            ? "bg-primary/10 ring-primary/25"
                            : "bg-muted/30 ring-border/60",
                        )}
                      >
                        {m.text || <span className="text-muted-foreground">No text — {m.kind}</span>}
                        {KIND_NOTE[m.kind] && (
                          <div className="mt-1 text-[10.5px] text-muted-foreground">{KIND_NOTE[m.kind]}</div>
                        )}
                        {m.error && (
                          <div className="mt-1 flex items-start gap-1 text-[10.5px] text-destructive">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            Telegram refused this one: {m.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={paired ? "Write a reply to your Telegram chat" : "Pair a chat to reply from here"}
          disabled={!paired || sending}
          rows={2}
          className="min-h-[44px] resize-none text-[12.5px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <Button
          size="sm"
          className="h-11 shrink-0 gap-1.5"
          disabled={!paired || sending || !draft.trim()}
          onClick={() => void send()}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </Button>
      </div>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Goes out as plain text from your bot. Approvals, exports and payments stay in Vanta.
      </p>
    </section>
  );
}
