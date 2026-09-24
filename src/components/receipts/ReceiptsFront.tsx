// Receipts front layer — six human lines. Conclusion first; the raw record
// lives one level deeper.
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";
import type { ReceiptLine } from "@/lib/receiptDigest";
import { useEffect, useState } from "react";
import { play } from "@/lib/streetSound";
import { isFreshReceipt, markReceiptsSeen, readReceiptsSeen } from "@/lib/tactile";

function tone(line: ReceiptLine): "primary" | "accent" | "destructive" | "muted" {
  if (line.count === 0) return "muted";
  if (line.key === "failed") return "destructive";
  if (line.key === "held_back" || line.key === "outside") return "accent";
  return "primary";
}

export function ReceiptsFront({
  lines,
  onDrill,
  className,
}: {
  lines: ReceiptLine[];
  /** Open the record filtered to this line, when the line has a way in. */
  onDrill?: (line: ReceiptLine) => void;
  className?: string;
}) {
  /* Read once per visit: what landed since you last looked gets inked. */
  const [seen] = useState(() => readReceiptsSeen());
  const anyFresh = lines.some((l) => l.count > 0 && isFreshReceipt(l.at, seen));
  useEffect(() => {
    if (anyFresh) window.setTimeout(() => play("stamp"), 180);
    const t = window.setTimeout(() => markReceiptsSeen(), 1500);
    return () => window.clearTimeout(t);
  }, [anyFresh]);
  return (
    <ul className={cn("divide-y divide-border/40", className)}>
      {lines.filter((line) => line.count > 0).map((line) => {
        const drillable = line.count > 0 && Boolean(onDrill);
        const body = (
          <>
            <div className="flex items-center gap-2">
              <StatusDot tone={tone(line)} />
              <span className={cn(isFreshReceipt(line.at, seen) ? "receipt-stamp-heavy" : "sticker-slap", "bg-muted/40 px-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground")}>{line.label}</span>
              {line.at && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/80">
                  {formatDistanceToNow(new Date(line.at), { addSuffix: true })}
                </span>
              )}
            </div>
            <p className={cn("ml-4 mt-0.5 text-[12.5px]", line.count === 0 ? "text-muted-foreground" : "text-foreground/95")}>
              {line.sentence}
            </p>
          </>
        );

        return (
          <li key={line.key}>
            {drillable ? (
              <button
                type="button"
                onClick={() => onDrill?.(line)}
                className="block w-full px-3 py-2.5 text-left hover:bg-muted/25"
              >
                {body}
              </button>
            ) : (
              <div className="px-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
