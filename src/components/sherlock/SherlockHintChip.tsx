// SherlockHintChip — one-line, calm hint shown inside Live Capture rows,
// connected-account cards, or any place a "Sherlock noticed something" cue
// adds value without dominating the surface.
//
// Doctrine: never lead with the word "Sherlock". Use plain English.
// Tap opens the review/compare surface — nothing executes.
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { confidenceWord, sherlockTitle } from "@/lib/plainEnglish";

export type SherlockHint = {
  id: string;
  mode: string;
  summary?: string | null;
  confidence?: string | null;
  suggested_action?: string | null;
};

export function SherlockHintChip({
  hint,
  onOpen,
  className,
}: {
  hint: SherlockHint;
  onOpen: (h: SherlockHint) => void;
  className?: string;
}) {
  const title = sherlockTitle(hint);
  const word = confidenceWord(hint.confidence ?? undefined);
  const text = hint.summary?.trim() || title;
  return (
    <button
      type="button"
      onClick={() => onOpen(hint)}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10.5px] text-foreground/85 hover:bg-primary/10 hover:text-foreground",
        className,
      )}
      title="Possible connection — tap to review. Nothing applies yet."
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0 text-primary/80" aria-hidden />
      <span className="truncate">{text}</span>
      <span className="shrink-0 text-[9.5px] uppercase tracking-wider text-muted-foreground">
        {word}
      </span>
      <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
