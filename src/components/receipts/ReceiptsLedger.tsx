// ReceiptsLedger — the audit as a readable ledger: grouped by day, each row
// with a time, a type, what happened and a status. Housekeeping stays hidden
// unless asked for; nothing is invented, every row is a recorded event.
import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { isNoise, plainLabel } from "@/lib/changeBuckets";

type Row = { id: string; event: string; entity_type: string; created_at: string };
type Status = "failed" | "held" | "approved" | "done" | "waiting";

const STATUS: Record<Status, { label: string; cls: string }> = {
  failed: { label: "Failed", cls: "text-destructive border-destructive/50 bg-destructive/10" },
  held: { label: "Held back", cls: "text-warn border-warn/50 bg-warn/10" },
  waiting: { label: "Waiting", cls: "text-accent border-accent/50 bg-accent/10" },
  approved: { label: "Approved", cls: "text-primary border-primary/50 bg-primary/10" },
  done: { label: "Done", cls: "text-muted-foreground border-border/60 bg-muted/20" },
};

function statusOf(event: string): Status {
  const e = event.toLowerCase();
  if (/fail|error|reject|refused/.test(e)) return "failed";
  if (/held|suppress|blocked|skipped|deferred|withheld/.test(e)) return "held";
  if (/staged|needs|pending|review|proposed/.test(e)) return "waiting";
  if (/approv/.test(e)) return "approved";
  return "done";
}

function typeOf(entity: string) {
  const t = entity.replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Record";
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
}

export function ReceiptsLedger({ rows, className }: { rows: Row[]; className?: string }) {
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(40);
  const visible = useMemo(() => rows.filter((r) => showAll || !isNoise(r.event)), [rows, showAll]);
  const hidden = rows.length - rows.filter((r) => !isNoise(r.event)).length;

  const days = useMemo(() => {
    const out: { label: string; rows: Row[] }[] = [];
    for (const r of visible.slice(0, limit)) {
      const label = dayLabel(new Date(r.created_at));
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [visible, limit]);

  if (rows.length === 0) return null;

  return (
    <section className={cn("vanta-card overflow-hidden p-0", className)}>
      <div className="hidden grid-cols-[56px_110px_1fr_92px] gap-2 border-b border-border/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:grid">
        <span>Time</span><span>Type</span><span>What happened</span><span className="text-right">Status</span>
      </div>
      {days.map((d) => (
        <div key={d.label}>
          <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border/40 bg-surface-elevated px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-foreground/80">
            {d.label}
            <span className="text-muted-foreground">· {d.rows.length}</span>
          </div>
          <ul>
            {d.rows.map((r) => {
              const s = STATUS[statusOf(r.event)];
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[48px_1fr_auto] items-center gap-2 border-b border-border/25 px-3 py-2 text-xs sm:grid-cols-[56px_110px_1fr_92px]"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{format(new Date(r.created_at), "HH:mm")}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{typeOf(r.entity_type)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground/95">{plainLabel(r.event)}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground sm:hidden">{typeOf(r.entity_type)}</span>
                  </span>
                  <span className={cn("justify-self-end rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]", s.cls)}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
        {hidden > 0 ? (
          <button type="button" className="min-h-[36px] hover:text-foreground" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide background checks" : `Show ${hidden} background checks`}
          </button>
        ) : <span />}
        {visible.length > limit && (
          <button type="button" className="min-h-[36px] hover:text-foreground" onClick={() => setLimit((l) => l + 40)}>
            Show older
          </button>
        )}
      </div>
    </section>
  );
}
