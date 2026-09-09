// TripHistoryPanel — the trips you actually closed, on the place desk.
//
// Reads recorded trips only. Distance and duration come from the same shared
// trip spine Telegram and the server use, so no two surfaces can disagree about
// how far you went. Deleting a trip is your tap, and it is the only write here.
import { useState } from "react";
import { Route, Trash2 } from "lucide-react";
import { MachineLabel } from "@/components/ui/instrument";
import { useTrips } from "@/hooks/useTrips";
import { thisWeekLine, tripSummaryLine, type Trip } from "@/lib/trips";
import { vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripHistoryPanel({ className }: { className?: string }) {
  const { trips, loading, deleteTrip } = useTrips();
  const [showAll, setShowAll] = useState(false);

  const closed: Trip[] = trips.filter((t) => !!t.ended_at);
  const week = thisWeekLine(trips);
  const shown = showAll ? closed.slice(0, 30) : closed.slice(0, 5);

  return (
    <section className={cn("vanta-card rounded-xl p-3", className)} aria-label="Trip history">
      <div className="flex items-center gap-1.5">
        <Route className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <MachineLabel className="text-foreground/70">Trip history</MachineLabel>
        <span className="ml-auto text-[11px] text-muted-foreground">{closed.length}</span>
      </div>

      {week ? <p className="mt-1.5 text-[12px] leading-snug text-foreground/85">{week}</p> : null}

      {loading ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Reading your trips…</p>
      ) : closed.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          No closed trips yet. Start one when you set off — here or from Telegram, it's the same
          record — and every leg you close lands on this list with its distance.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {shown.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded-lg border border-border/50 bg-surface-elevated/30 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {t.label?.trim() || `${t.start_label ?? "somewhere"} → ${t.end_label ?? "somewhere"}`}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {dayLabel(t.started_at)} · {tripSummaryLine(t)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm("Delete this trip and its points?")) return;
                    await deleteTrip(t.id);
                    vantaToast.info("Trip deleted. Its points went with it.");
                  }}
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="Delete trip"
                  title="Delete trip"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {closed.length > shown.length || showAll ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 min-h-[32px] text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Show fewer" : `Show all ${closed.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
