// ReceiptsLedger — the audit as a roll of station tickets: grouped by day,
// each slip torn off the same thermal stock with a time, a type, what
// happened, and a rubber-ink stamp pressed on it. Filed and approved slips
// carry the conductor's hole-punch. A held slip says what held it — quiet
// hours is never dressed up as failure. Housekeeping stays hidden unless
// asked for; nothing is invented, every row is a recorded event. Tapping a
// slip snaps it open to the provenance drawer.
import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { isNoise, plainLabel } from "@/lib/changeBuckets";
import { play } from "@/lib/streetSound";

export type LedgerRow = {
  id: string;
  event: string;
  entity_type: string;
  created_at: string;
  entity_id?: string | null;
  payload?: any;
};
type Line = LedgerRow & { times: number };
const quiet = (r: LedgerRow) => isNoise(r.event) || isNoise(`${r.entity_type}_${r.event}`) || /calendar[_ ]?feed/i.test(r.entity_type) && /sync/i.test(r.event);
type Status = "failed" | "held" | "approved" | "done" | "waiting";

/** Ink on the stamp. Quiet hours gets its own imprint — held is not failed. */
function stampText(status: Status, r: LedgerRow): string {
  if (status === "held") {
    const reason = r.payload?.held_reason ?? r.payload?.reason;
    if (reason === "quiet_hours") return "Held by quiet hours";
    if (reason === "push_off") return "Held · push off";
    return "Held back";
  }
  return { failed: "Failed", waiting: "Waiting", approved: "Approved", done: "Filed" }[status];
}

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

/** Thermal ink fades: slips older than a day print aged. */
const AGED_MS = 24 * 3_600_000;

export function ReceiptsLedger({
  rows,
  className,
  onOpen,
}: {
  rows: LedgerRow[];
  className?: string;
  /** Snap a slip open to its provenance. */
  onOpen?: (row: LedgerRow) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(40);
  const visible = useMemo(() => rows.filter((r) => showAll || !quiet(r)), [rows, showAll]);
  const hidden = rows.length - rows.filter((r) => !quiet(r)).length;

  const days = useMemo(() => {
    const out: { label: string; rows: Line[] }[] = [];
    for (const r of visible.slice(0, limit)) {
      const label = dayLabel(new Date(r.created_at));
      const last = out[out.length - 1];
      const prev = last?.label === label ? last.rows[last.rows.length - 1] : undefined;
      // Back-to-back repeats fold into one line with a count.
      if (prev && prev.event === r.event && prev.entity_type === r.entity_type) prev.times += 1;
      else if (last && last.label === label) last.rows.push({ ...r, times: 1 });
      else out.push({ label, rows: [{ ...r, times: 1 }] });
    }
    return out;
  }, [visible, limit]);

  if (rows.length === 0) return null;

  const now = Date.now();

  return (
    <section className={cn("thermal-roll relative overflow-hidden", className)}>
      {days.length === 0 && (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">Only background checks in this stretch — calendar syncs and scans. Anything you save, approve or run shows up here with a time on it.</p>
      )}
      {days.map((d) => (
        <div key={d.label}>
          <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border/40 bg-background/95 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-foreground/80 backdrop-blur-sm">
            {d.label}
            <span className="text-muted-foreground">· {d.rows.reduce((n, r) => n + r.times, 0)}</span>
          </div>
          <ul>
            {d.rows.map((r) => {
              const status = statusOf(r.event);
              const aged = now - Date.parse(r.created_at) > AGED_MS;
              const punched = status === "approved" || status === "done";
              const body = (
                <>
                  {punched && <span className="ticket-punch" aria-hidden />}
                  <span className="thermal-ink text-[11px] text-muted-foreground">{format(new Date(r.created_at), "HH:mm")}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{typeOf(r.entity_type)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground/95">{plainLabel(r.event)}{r.times > 1 ? <span className="text-muted-foreground"> · {r.times}×</span> : null}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground sm:hidden">{typeOf(r.entity_type)}</span>
                  </span>
                  <span className="ticket-stamp justify-self-end" data-status={status}>
                    {stampText(status, r)}
                  </span>
                </>
              );
              return (
                <li
                  key={r.id}
                  className="thermal-slip"
                  data-aged={aged ? "true" : undefined}
                >
                  {onOpen ? (
                    <button
                      type="button"
                      onClick={() => { play("snap"); onOpen(r); }}
                      aria-label={`Open the record for ${plainLabel(r.event)}`}
                      className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/25 sm:grid-cols-[48px_110px_1fr_auto]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2 text-xs sm:grid-cols-[48px_110px_1fr_auto]">
                      {body}
                    </div>
                  )}
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
