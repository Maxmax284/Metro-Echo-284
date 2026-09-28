// WorldFollowUps — the doors a live-world answer opens.
//
// Shown only under an answer Echo really fetched from the web (the provenance
// rides in the message metadata). "Keep me updated" starts a real watch — a
// page watch for a page answer, a topic watch for a question — or says plainly
// why it could not. Monitoring is never claimed without the row behind it.
// "Show affected areas" is simply the next question in the same thread.
// A declined offer stays declined for that answer.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { Check, Eye, MapPin, X } from "lucide-react";
import {
  affectedAreasPrompt,
  followUpDismissKey,
  freshnessWord,
  isLiveWorldAnswer,
  sourceChips,
  watchTargetFor,
  type LiveWorldMeta,
} from "@/lib/worldFollowUps";

type Props = {
  messageId?: string;
  metadata: LiveWorldMeta;
  busy: boolean;
  /** Sends the next question into the same thread. */
  onSendPrompt: (text: string) => void;
  /** Leaves the thread a receipt line once the watch really exists. */
  onWatched: (summary: string) => void;
};

export function WorldFollowUps({ messageId, metadata, busy, onSendPrompt, onWatched }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(followUpDismissKey(messageId, metadata?.question)) === "1";
    } catch {
      return false;
    }
  });
  const [watch, setWatch] = useState<"idle" | "starting" | "watching" | "already">(
    metadata?.watching ? "already" : "idle",
  );

  if (!isLiveWorldAnswer(metadata) || dismissed) return null;
  const target = watchTargetFor(metadata);
  const chips = sourceChips(metadata);
  const fresh = freshnessWord(metadata?.checked_at ?? null);
  if (!target && chips.length === 0) return null;

  const keepWatching = async () => {
    if (!target || watch !== "idle") return;
    setWatch("starting");
    try {
      const { data, error } = await supabase.functions.invoke("web-look", {
        body:
          target.mode === "page"
            ? { mode: "watch", url: target.url, question: target.question, why: target.question }
            : { mode: "watch", question: target.question },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; answer?: string | null };
      if (!payload.ok) {
        throw new Error(payload.answer ?? "Echo could not start that watch.");
      }
      const summary = payload.answer ?? "Echo is keeping an eye on it.";
      setWatch(/already/i.test(summary) ? "already" : "watching");
      onWatched(summary);
      toast.success({ title: "Echo is keeping an eye on it." });
    } catch (e) {
      setWatch("idle");
      toast.fromError(e);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(followUpDismissKey(messageId, metadata?.question), "1");
    } catch {
      /* a declined offer still stays declined for this render */
    }
    setDismissed(true);
  };

  return (
    <div className="ml-1 flex flex-wrap items-center gap-1.5 pt-0.5">
      {chips.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {chips.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-muted/30 px-1.5 py-0.5 ring-1 ring-border/50 transition-colors hover:bg-muted/50"
            >
              {c.host}
            </a>
          ))}
          {fresh && <span className="text-muted-foreground/70">· read {fresh}</span>}
        </span>
      )}
      {target && (watch === "idle" || watch === "starting") && (
        <button
          type="button"
          disabled={busy || watch === "starting"}
          onClick={() => void keepWatching()}
          className="vanta-focus inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] text-foreground/90 transition-colors hover:bg-primary/15 disabled:opacity-50"
        >
          <Eye className="h-3 w-3 text-primary/80" />
          {watch === "starting" ? "Starting…" : "Keep me updated"}
        </button>
      )}
      {target && (watch === "watching" || watch === "already") && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[12px] text-foreground/85">
          <Check className="h-3 w-3 text-primary" />
          Echo is keeping an eye on it
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onSendPrompt(affectedAreasPrompt(metadata))}
        className="vanta-focus inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-elevated/60 px-2.5 py-1 text-[12px] text-foreground/85 transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
      >
        <MapPin className="h-3 w-3 text-primary/80" />
        Show affected areas
      </button>
      <button
        type="button"
        aria-label="Dismiss these suggestions"
        onClick={dismiss}
        className="vanta-focus inline-flex items-center rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
