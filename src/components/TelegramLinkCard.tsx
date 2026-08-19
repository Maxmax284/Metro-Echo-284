import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon, ExternalLink, ShieldCheck, Copy, Send } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { StatusDot } from "@/components/ui/status-dot";

type Link = { id: string; chat_id: number; tg_username: string | null; linked_at: string };

export function TelegramLinkCard() {
  const [links, setLinks] = useState<Link[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [bot, setBot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("telegram_chat_links")
      .select("id, chat_id, tg_username, linked_at")
      .order("linked_at", { ascending: false });
    setLinks((data ?? []) as Link[]);
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-link", { body: {} });
      if (error) throw error;
      setCode(data?.code ?? null);
      setDeepLink(data?.deep_link ?? null);
      setBot(data?.bot_username ?? null);
    } catch (e) {
      toast.fromError(e, "Couldn't generate a code right now.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string) => {
    await supabase.from("telegram_chat_links").delete().eq("id", id);
    load();
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-test");
      if (error) throw error;
      const d = (data ?? {}) as { sent?: number; failed?: number; reason?: string; public_url_present?: boolean };
      if (d.reason === "no_links") {
        toast("Pair a Telegram chat first.");
      } else if ((d.sent ?? 0) > 0) {
        toast.success(`Test sent to ${d.sent} chat${d.sent === 1 ? "" : "s"}.${d.public_url_present ? "" : " (No deep link — VANTA_PUBLIC_URL not set.)"}`);
      } else {
        toast("Telegram didn't accept the message. Check Audit.");
      }
    } catch (e) {
      toast.fromError(e, "Test send failed.");
    } finally {
      setBusy(false);
    }
  };

  const registerWebhook = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-register");
      if (error) throw error;
      const d = (data ?? {}) as { registered?: boolean; reason?: string; last_error_message?: string | null };
      if (d.registered) {
        toast.success("Telegram now delivers messages to Vanta.");
      } else {
        toast(d.reason ?? d.last_error_message ?? "Telegram didn't accept the connection.");
      }
    } catch (e) {
      toast.fromError(e, "Couldn't open the Telegram connection.");
    } finally {
      setBusy(false);
    }
  };


  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success(vantaSay.copied());
  };

  const linked = links.length > 0;

  return (
    <div className="surface-elevated rounded-xl border border-border/60 p-4">
      {/* Header row: title + linked status chip */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LinkIcon className="h-4 w-4 text-primary" /> Telegram
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
          <StatusDot tone={linked ? "primary" : "muted"} />
          {linked ? `${links.length} linked` : "not linked"}
        </span>
      </div>

      {/* Architectural law — visible, not buried */}
      <div className="mb-3 rounded-md border border-border/50 bg-muted/20 p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-primary" />
          Capture layer only
        </div>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Messages become <strong className="text-foreground/85">drafts</strong> inside Vanta — never live actions.
          Plan → Approve → Execute always happens here. Telegram feeds the system; it doesn't control it.
        </p>
      </div>

      {linked && (
        <div className="mb-3 space-y-1.5">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <StatusDot tone="primary" title="paired" />
                <span className="truncate">{l.tg_username ? `@${l.tg_username}` : `chat ${l.chat_id}`}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  · paired {formatDistanceToNow(new Date(l.linked_at), { addSuffix: true })}
                </span>
              </span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => unlink(l.id)}>Unlink</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={sendTest} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test Telegram now
          </Button>
          <Button size="sm" variant="ghost" className="w-full gap-1.5" onClick={registerWebhook} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Reconnect inbound messages
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Run this once so messages you send the bot actually reach Vanta, and again if replies stop arriving.
          </p>
        </div>
      )}

      {!code && (
        <Button size="sm" onClick={generate} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {linked ? "Pair another chat" : "Generate pairing code"}
        </Button>
      )}

      {code && (
        <div className="space-y-2">
          <button
            onClick={copyCode}
            className="group relative w-full rounded-md border border-border/60 bg-background/40 p-2.5 text-center font-mono text-lg tracking-[0.4em] transition-colors hover:bg-background/60"
            title="Copy code"
          >
            {code}
            <Copy className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <p className="text-xs text-muted-foreground">
            {bot ? <>Open <span className="font-mono">@{bot}</span> and send:</> : "Open your Vanta bot and send:"}
            <span className="ml-1 font-mono text-foreground">/start {code}</span>
          </p>
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open in Telegram <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <StatusDot tone="accent" pulse />
            Code expires in 15 minutes. Refresh after pairing.
          </div>
        </div>
      )}
    </div>
  );
}
