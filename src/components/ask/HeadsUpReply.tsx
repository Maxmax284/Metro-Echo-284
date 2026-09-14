// HeadsUpReply — answer a heads-up where you're reading it.
//
// Doctrine: this is not a second chat engine. The reply goes through the one
// Ask turn (useAskTurn) into a thread bound to that heads-up, so the same
// back-and-forth is readable later in Inbox → Heads-ups. Echo answers and
// prepares; anything that touches the outside world still waits for approval.
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, CornerDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StructuredResponse } from "@/components/companion/StructuredResponse";
import { ProcessingLine } from "@/components/companion/ProcessingLine";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useAskTurn, type AskMsg } from "@/hooks/useAskTurn";
import { useDictation } from "@/hooks/useDictation";
import { useCompanion } from "@/components/companion/CompanionContext";
import { RECEIPT_META } from "@/lib/askReceipts";
import { getAskSession, subscribeAskSession } from "@/lib/askSession";
import { MOTION_PRESS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function HeadsUpReply({
  nudgeId,
  label,
  /** Called once the reply is on its way, so the host can mark it acted on. */
  onReplied,
  className,
}: {
  nudgeId: string;
  label: string;
  onReplied?: () => void;
  className?: string;
}) {
  const { ensureThread, openThread } = useAskThreads();
  const { send } = useAskTurn();
  const { open, expand } = useCompanion();
  const [openBox, setOpenBox] = useState(false);
  const [draft, setDraft] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<AskMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation({
    onFinal: (phrase) => setDraft((d) => (d ? `${d} ${phrase}` : phrase)),
  });

  // Once a thread exists, this card reads the same live session as Ask does.
  useEffect(() => {
    if (!threadId) return;
    const s = getAskSession(threadId);
    setMsgs(s.messages as AskMsg[]);
    setStreaming(s.streaming);
    return subscribeAskSession(threadId, (next) => {
      setMsgs(next.messages as AskMsg[]);
      setStreaming(next.streaming);
    });
  }, [threadId]);

  useEffect(() => {
    if (openBox) boxRef.current?.focus();
  }, [openBox]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    if (dictation.listening) dictation.stop();
    const id = threadId ?? (await ensureThread({ kind: "nudge", id: nudgeId, label }));
    if (!id) return;
    setThreadId(id);
    setDraft("");
    onReplied?.();
    await send(text, {
      threadId: id,
      context: { kind: "nudge", id: nudgeId, label },
      intentMeta: { nudge_id: nudgeId },
    });
  };

  const turns = msgs.filter((m) => m.role !== "system" || m.receipt);

  if (!openBox && !threadId) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 px-2 text-[11.5px] text-muted-foreground", MOTION_PRESS, className)}
        onClick={() => setOpenBox(true)}
      >
        Reply
      </Button>
    );
  }

  return (
    <div className={cn("mt-1.5 space-y-2", className)}>
      {turns.length > 0 && (
        <div className="space-y-1.5">
          {turns.map((m, i) => {
            if (m.receipt) {
              const meta = RECEIPT_META[m.receipt.kind];
              const Icon = meta.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-[3px] border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5 text-[11.5px] text-foreground/90"
                >
                  <Icon className="h-3 w-3 shrink-0 text-primary" />
                  <span className="font-medium">{meta.label}:</span>
                  <span className="truncate text-muted-foreground">{m.receipt.summary}</span>
                </div>
              );
            }
            return (
              <div
                key={i}
                className={cn(
                  "rounded-[3px] px-2 py-1.5 text-[12.5px] leading-relaxed",
                  m.role === "user"
                    ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                    : "surface-elevated text-foreground/95 ring-1 ring-border/60",
                )}
              >
                {m.role === "assistant"
                  ? (m.content
                      ? <StructuredResponse text={m.content} />
                      : (streaming ? <ProcessingLine phase="reading" label="reading this heads-up" /> : ""))
                  : m.content}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <Textarea
          ref={boxRef}
          value={draft + (dictation.interim ? ` ${dictation.interim}` : "")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="Say what you want done about this…"
          className="min-h-[44px] resize-none text-[13px]"
        />
        {dictation.supported && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={dictation.listening ? "Stop dictation" : "Reply by voice"}
            className={cn("h-11 w-11 shrink-0", dictation.listening ? "text-accent" : "text-muted-foreground", MOTION_PRESS)}
            onClick={dictation.toggle}
          >
            {dictation.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          aria-label="Send reply"
          disabled={!draft.trim() || streaming}
          className={cn("h-11 w-11 shrink-0", MOTION_PRESS)}
          onClick={() => void submit()}
        >
          <CornerDownLeft className="h-4 w-4" />
        </Button>
      </div>

      {dictation.error && <p className="text-[11px] text-muted-foreground">{dictation.error}</p>}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Echo can prepare the work. You still approve anything that acts.</span>
        {threadId && (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
            onClick={() => { openThread(threadId); open(); expand(); }}
          >
            Open in Ask <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
