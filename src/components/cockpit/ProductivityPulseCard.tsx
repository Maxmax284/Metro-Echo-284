// Wave 4 — Productivity Pulse card. Calm, doctrine-respecting metrics card.
// No exclamation marks, no celebration copy. Just structure.
import { Card } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useProductivityPulse } from "@/hooks/useProductivityPulse";

function Sparkline({ values }: { values: number[] }) {
  const w = 96; const h = 22;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * h}
          r={1.4}
          fill="hsl(var(--primary))"
          opacity={v > 0 ? 0.9 : 0.3}
        />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function ProductivityPulseCard() {
  const p = useProductivityPulse();

  if (p.loading) {
    return (
      <Card className="border-border/60 bg-surface-elevated/40 p-4">
        <div className="text-[11px] text-muted-foreground">Pulse loading…</div>
      </Card>
    );
  }

  const med = p.week.medianMinutesToExecute;
  const medLabel = med == null
    ? "—"
    : med >= 60 ? `${(med / 60).toFixed(1)}h`
    : `${Math.round(med)}m`;

  return (
    <Card className="flex flex-col gap-3 border-border/60 bg-surface-elevated/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Productivity pulse
        </div>
        <span className="text-[10px] text-muted-foreground">last 7 days</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Captured" value={p.today.captures} />
        <Stat label="Triaged" value={p.today.triaged} />
        <Stat label="Executed" value={p.today.executed} />
        <Stat label="Closed" value={p.today.commitmentsClosed} />
      </div>
      <div className="text-[10px] text-muted-foreground">Today's tally.</div>

      <div className="flex items-end justify-between gap-3 pt-1">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">7d executed</span>
          <span className="text-sm tabular-nums text-foreground">
            {p.week.executed}<span className="text-muted-foreground"> / {p.week.proposed} proposed</span>
          </span>
        </div>
        <Sparkline values={p.week.sparkline} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Median time to execute: <span className="text-foreground">{medLabel}</span></span>
        <span>{p.week.commitmentsClosed} commitments closed</span>
      </div>
    </Card>
  );
}
