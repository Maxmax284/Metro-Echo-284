import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";

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
      toast.error(e instanceof Error ? e.message : "Couldn't generate code");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string) => {
    await supabase.from("telegram_chat_links").delete().eq("id", id);
    load();
  };

  return (
    <div className="surface-elevated rounded-xl border border-border/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <LinkIcon className="h-4 w-4 text-primary" /> Telegram
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Reach Vanta from anywhere. Pair a chat once; messages route into your conversation and intent pipeline.
      </p>

      {links.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-signal" />
                {l.tg_username ? `@${l.tg_username}` : `chat ${l.chat_id}`}
              </span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => unlink(l.id)}>Unlink</Button>
            </div>
          ))}
        </div>
      )}

      {!code && (
        <Button size="sm" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Generate pairing code
        </Button>
      )}

      {code && (
        <div className="space-y-2">
          <div className="rounded-md border border-border/60 bg-background/40 p-2.5 font-mono text-center text-lg tracking-[0.4em]">
            {code}
          </div>
          <p className="text-xs text-muted-foreground">
            {bot ? <>Open <span className="font-mono">@{bot}</span> and send:</> : "Open your Vanta bot and send:"}
            <span className="ml-1 font-mono text-foreground">/start {code}</span>
          </p>
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open in Telegram <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-[11px] text-muted-foreground">Code expires in 15 minutes. Refresh after pairing.</p>
        </div>
      )}
    </div>
  );
}
