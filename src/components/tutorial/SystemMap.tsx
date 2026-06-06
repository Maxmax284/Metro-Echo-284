// SystemMap — "How Vanta Works" visual flow. Used in Settings.
// Pure text + arrows. No diagrams library needed. Mobile-first.
import { ArrowDown } from "lucide-react";
import { PLACE_LABELS, PLACE_TAGLINES } from "@/lib/plainLabels";

const STEPS: Array<{ label: string; tagline: string }> = [
  { label: "Capture", tagline: "Speak, type, drop a file. Nothing executes." },
  { label: PLACE_LABELS.INBOX, tagline: PLACE_TAGLINES.INBOX },
  { label: PLACE_LABELS.PROJECTS, tagline: "Items connect to the right project, automatically or by hand." },
  { label: PLACE_LABELS.COMMAND, tagline: PLACE_TAGLINES.COMMAND },
  { label: PLACE_LABELS.BRIEFS, tagline: "Turn the situation into a shareable PDF or audio briefing." },
  { label: PLACE_LABELS.RECEIPTS, tagline: PLACE_TAGLINES.RECEIPTS },
];

export function SystemMap() {
  return (
    <div className="space-y-2">
      {STEPS.map((s, i) => (
        <div key={s.label}>
          <div className="rounded-md border border-border/60 bg-surface-elevated/40 px-3 py-2">
            <div className="text-[13px] font-medium text-foreground">{s.label}</div>
            <div className="text-[11.5px] text-muted-foreground">{s.tagline}</div>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex justify-center py-0.5 text-muted-foreground/60">
              <ArrowDown className="h-3 w-3" />
            </div>
          )}
        </div>
      ))}
      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        Every screen should answer: what is happening, why, and what to do next.
      </p>
    </div>
  );
}
