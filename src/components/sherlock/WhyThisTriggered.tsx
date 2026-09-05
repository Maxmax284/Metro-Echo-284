// WhyThisTriggered — the reasoning, in the open.
//
// Doctrine: inference is labelled on the card. Every line names the record it
// came from, confidence reads as words, and a thin explanation says it is thin
// rather than inventing a fuller one.
import { WhySurfaced } from "@/components/ui/why-surfaced";
import { whyForFinding } from "@/lib/sherlockWhy";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { cn } from "@/lib/utils";

export function WhyThisTriggered({
  finding,
  className,
}: {
  finding: SherlockFinding;
  className?: string;
}) {
  return (
    <div className={cn("mt-2 border-t border-border/40 pt-1.5", className)}>
      <WhySurfaced why={whyForFinding(finding)} label="Why this triggered" />
    </div>
  );
}
