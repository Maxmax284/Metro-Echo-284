// SensitivityReviewStep — pre-export gate.
// If the draft brief contains anything that looks financial/medical/legal/etc,
// the user must explicitly tick "I've reviewed, export anyway" before the
// Approve & Export button is unlocked.
import { ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { SensitivityReport } from "@/lib/briefSensitivity";

export function SensitivityReviewStep({
  report, formatLabel, acknowledged, onAcknowledge,
}: {
  report: SensitivityReport;
  formatLabel: string;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  if (!report.any) return null;
  return (
    <div className="mt-3 rounded-md border border-warn/40 bg-warn/5 p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="text-[12.5px] font-medium text-foreground">
              Looks like this brief includes sensitive content
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Vanta flagged things that often shouldn't leave the system without a second look.
              Approve below to export as <span className="text-foreground/90">{formatLabel}</span>.
            </p>
          </div>

          {report.category_summary.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {report.category_summary.map((c) => (
                <Badge key={c.category} variant="secondary" className="text-[10px]">
                  {c.label} · {c.count}
                </Badge>
              ))}
            </div>
          )}

          <ul className="space-y-1.5">
            {report.hits.slice(0, 4).map((h, i) => (
              <li key={i} className="rounded border border-border/50 bg-background/40 p-2 text-[11.5px]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.heading ?? h.section_id} · {h.categories.join(", ")}
                </div>
                <div className="text-foreground/85">{h.excerpt}</div>
              </li>
            ))}
            {report.hits.length > 4 && (
              <li className="text-[10.5px] text-muted-foreground">
                +{report.hits.length - 4} more flagged sections
              </li>
            )}
          </ul>

          <label className="flex items-center gap-2 text-[12px] text-foreground/90">
            <Checkbox checked={acknowledged} onCheckedChange={(v) => onAcknowledge(Boolean(v))} />
            <span>I've reviewed the flagged content and want to export anyway.</span>
          </label>
        </div>
      </div>
    </div>
  );
}
