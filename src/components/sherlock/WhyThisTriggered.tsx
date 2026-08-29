// WhyThisTriggered — the reasoning, in the open.
//
// Doctrine: inference is labelled on the card. Every line names the record it
// came from, confidence reads as words, and a thin explanation says it is thin
// rather than inventing a fuller one.
import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { explainFinding } from "@/lib/sherlockWhy";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { cn } from "@/lib/utils";

export function WhyThisTriggered({
  finding,
  className,
}: {
  finding: SherlockFinding;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const why = explainFinding(finding);

  return (
    <div className={cn("mt-2 border-t border-border/40 pt-1.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 text-[10.5px] text-muted-foreground transition hover:text-foreground"
      >
        <HelpCircle className="h-3 w-3" aria-hidden />
        Why this triggered
        {open ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {why.signals.length > 0 && (
            <ul className="space-y-1">
              {why.signals.map((s, i) => (
                <li key={i} className="text-[11px] leading-snug text-foreground/90">
                  · {s.text}{" "}
                  <span className="text-muted-foreground">(read from {s.from})</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">Confidence: {why.confidenceLine}</p>
          <p className="text-[10px] italic text-muted-foreground/70">{why.closing}</p>
        </div>
      )}
    </div>
  );
}
