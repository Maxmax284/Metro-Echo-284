// ReadNote — the visible difference between what Vanta read and what it guessed.
//
// Doctrine: a direct read looks ordinary. An inference reads as an inference, on
// the card, in words. Uncertainty is never hidden behind a tooltip and never
// rounded up into a fact.
import { CircleHelp, Eye, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeRead, type ReadKind } from "@/lib/confidence";

export function ReadNote({
  kind,
  source,
  confidence,
  about,
  className,
}: {
  kind: ReadKind;
  /** What the record stored as its source, for direct reads. */
  source?: string | null;
  /** 0..1 from the record, for inferences. */
  confidence?: number | null;
  /** The thing Vanta thinks this relates to. */
  about?: string | null;
  className?: string;
}) {
  const note = describeRead({ kind, source, confidence, about });
  if (!note) return null;

  const Icon = note.kind === "read" ? Eye : note.needsReview ? CircleHelp : Sparkles;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10.5px]",
        note.needsReview ? "text-amber-400" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="truncate">{note.text}</span>
    </span>
  );
}
