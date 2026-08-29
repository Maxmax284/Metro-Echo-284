// ObjectLife — how this object got here, in one line.
//
// Doctrine: Receipts remains the full evidence layer. This is the summary a user
// reads without leaving the card, built only from recorded events. When nothing
// has been recorded it says so rather than inventing a story.
import { cn } from "@/lib/utils";
import { buildObjectLife, NO_LIFE_LINE, type LifeEvent } from "@/lib/objectLife";

export function ObjectLife({
  events,
  /** Optional current-state fragment, e.g. "due Fri" or "still open". */
  tail,
  /** Opens Receipts filtered to this object. Optional. */
  onOpenReceipts,
  className,
}: {
  events: LifeEvent[];
  tail?: string | null;
  onOpenReceipts?: () => void;
  className?: string;
}) {
  const life = buildObjectLife(events, tail);
  const line = life.line || NO_LIFE_LINE;

  return (
    <p className={cn("text-[10.5px] leading-snug text-muted-foreground", className)}>
      <span className="break-words">{line}</span>
      {onOpenReceipts && life.steps.length > 0 && (
        <>
          {" "}
          <button
            type="button"
            onClick={onOpenReceipts}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {life.truncated ? "full history" : "receipts"}
          </button>
        </>
      )}
    </p>
  );
}
