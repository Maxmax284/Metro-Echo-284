// SherlockDigestCard — the weekly read, in the room it belongs to.
//
// Doctrine: a background job reports a diff, never a status. A quiet week says
// so plainly. Nothing in this card files, accepts or runs anything.
import { CalendarRange, Check } from "lucide-react";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useSherlockDigest } from "@/hooks/useSherlockDigest";
import { format, parseISO } from "date-fns";

export function SherlockDigestCard() {
  const { digest, loading, markSeen } = useSherlockDigest();

  if (loading || !digest) return null;
  const d = digest.digest;
  const week = (() => {
    try { return format(parseISO(digest.week_start), "MMM d"); } catch { return digest.week_start; }
  })();

  return (
    <section className="vanta-card p-3" aria-label="Weekly Sherlock digest">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden /> Week of {week}
        </p>
        {digest.seen_at ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3 text-primary" aria-hidden /> read
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void markSeen()}
            className="min-h-[28px] rounded-full px-2 text-[10.5px] text-muted-foreground ring-1 ring-border/60 transition hover:text-foreground"
          >
            Mark read
          </button>
        )}
      </div>

      <p className="mt-1 text-[12.5px] leading-snug text-foreground">{d.headline}</p>

      {d.new_by_kind.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.new_by_kind.slice(0, 4).map((k) => (
            <li key={k.kind} className="flex items-baseline gap-2 text-[11.5px]">
              <span className="font-medium text-foreground">{k.count}</span>
              <span className="text-muted-foreground">{k.label}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10.5px] text-muted-foreground">
        You settled {d.settled.accepted + d.settled.dismissed} · {d.settled.accepted} accepted ·{" "}
        {d.settled.dismissed} dismissed
        {d.settled.marked_wrong > 0 ? ` · ${d.settled.marked_wrong} marked not right` : ""}
      </p>

      {d.look_again.length > 0 && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Look again</p>
          <ul className="mt-1 space-y-1">
            {d.look_again.map((l) => (
              <li key={l.id} className="text-[11.5px] leading-snug text-foreground/90">
                · {l.summary} <span className="text-muted-foreground">({l.confidence})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AftermathHint text="This read is kept · the items are still in the queue below, untouched" />
    </section>
  );
}
