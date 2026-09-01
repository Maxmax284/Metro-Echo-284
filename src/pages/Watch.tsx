// Watch — the trends behind the watch feed.
//
// It reads back only what was measured: fourteen days of steps, two days of
// heart rate, the workouts that arrived and the posture you set. A day with no
// record is a gap, never a zero. Reading this page changes nothing.
import { Link } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Activity, Footprints, HeartPulse, Moon, Scale, Timer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useWearableTrends } from "@/hooks/useWearableTrends";
import { POSTURE_LABEL } from "@/lib/awareness";
import { SOURCE_LABEL, formatMinutes } from "@/lib/wearable";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

function StepBars({ days, usual }: { days: { day: string; steps: number | null }[]; usual: number | null }) {
  const top = Math.max(1, ...days.map((d) => d.steps ?? 0));
  return (
    <div className="mt-2 flex items-end gap-[3px]" role="img" aria-label="Steps by day">
      {days.map((d) => {
        const h = d.steps === null ? 3 : Math.max(4, Math.round((d.steps / top) * 56));
        return (
          <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              title={
                d.steps === null
                  ? `${d.day} · nothing recorded`
                  : `${d.day} · ${d.steps} steps`
              }
              style={{ height: h }}
              className={cn(
                "w-full rounded-[1px]",
                d.steps === null
                  ? "bg-border/50"
                  : usual !== null && d.steps >= usual
                    ? "bg-primary/80"
                    : "bg-primary/40",
              )}
            />
            <span className="font-mono text-[8.5px] text-muted-foreground">
              {d.day.slice(8)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HeartLine({ points }: { points: { at: string; value: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 30 - ((p.value - lo) / span) * 26;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="mt-2">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="Heart rate over the last 48 hours">
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <MachineText className="text-[10px] text-muted-foreground">
        low {lo} bpm · high {hi} bpm · {points.length} readings
      </MachineText>
    </div>
  );
}

function NightBars({ nights, usual }: { nights: { day: string; minutes: number | null }[]; usual: number | null }) {
  const top = Math.max(1, ...nights.map((n) => n.minutes ?? 0));
  return (
    <div className="mt-2 flex items-end gap-[3px]" role="img" aria-label="Sleep by night">
      {nights.map((n) => {
        const h = n.minutes === null ? 3 : Math.max(4, Math.round((n.minutes / top) * 56));
        return (
          <div key={n.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              title={n.minutes === null ? `${n.day} · nothing recorded` : `${n.day} · ${formatMinutes(n.minutes)}`}
              style={{ height: h }}
              className={cn(
                "w-full rounded-[1px]",
                n.minutes === null
                  ? "bg-border/50"
                  : usual !== null && n.minutes >= usual
                    ? "bg-primary/70"
                    : "bg-amber-400/60",
              )}
            />
            <span className="font-mono text-[8.5px] text-muted-foreground">{n.day.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function WatchPage() {
  const [compareOpen, setCompareOpen] = useState(false);
  const { trends, loading, error, refresh } = useWearableTrends(14);
  const hrOn = trends.consent.heart_rate === true;
  const activityOn = trends.consent.activity === true;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/wearable-loop"
          aria-label="Back to the watch loop"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Your watch, over time</h1>
          <p className="text-xs text-muted-foreground">
            {trends.recordedFrom
              ? `Records go back to ${format(new Date(trends.recordedFrom), "d MMM, HH:mm")}.`
              : "Nothing has been recorded yet."}
          </p>
        </div>
      </header>

      {error ? (
        <ErrorState error={error} doing="reading your watch trends" onRetry={refresh} />
      ) : loading ? (
        <LoadingState label="Reading fourteen days…" />
      ) : !trends.anySensorOn ? (
        <section className="vanta-card p-4">
          <EmptyState
            title="No sense is switched on"
            hint="Heart rate and daily activity are both off, so there is nothing measured to draw. Turn one on in the watch loop and the first reading will appear here."
            actionLabel="Open the watch loop"
            onAction={() => { window.location.href = "/wearable-loop"; }}
          />
        </section>
      ) : !trends.readings.length ? (
        <section className="vanta-card p-4">
          <EmptyState
            title="Nothing has arrived yet"
            hint={
              activityOn
                ? "A sense is on, but no reading has been sent. Set up the phone hand-off in the watch loop, or connect a strap for heart rate."
                : "Heart rate is on but daily activity is off, so steps, sleep and workouts are not stored."
            }
            actionLabel="Open the watch loop"
            onAction={() => { window.location.href = "/wearable-loop"; }}
          />
        </section>
      ) : (
        <div className="space-y-3">
          {/* Steps */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Footprints className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Steps · 14 days</MachineLabel>
              <MachineText className="ml-auto text-[10px] text-muted-foreground">
                {activityOn ? (trends.stepsUsual !== null ? `usual ${trends.stepsUsual}` : "no history yet") : "off"}
              </MachineText>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">{trends.stepsLine}</p>
            {activityOn ? <StepBars days={trends.days} usual={trends.stepsUsual} /> : null}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              A flat grey bar means nothing was sent that day. Vanta does not read a missing day as
              a quiet one.
            </p>
          </section>

          {/* Heart rate */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Heart rate · 48 hours</MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {!hrOn
                ? "Switched off. Nothing is read and nothing is stored."
                : trends.heartLast
                  ? `Last reading ${Math.round(trends.heartLast.value)} bpm at ${format(new Date(trends.heartLast.measured_at), "d MMM HH:mm")}, ${SOURCE_LABEL[trends.heartLast.source]}.`
                  : "No reading yet. Connect a strap on the watch loop page to take one."}
            </p>
            {hrOn ? <HeartLine points={trends.heart} /> : null}
          </section>

          {/* Workouts */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Timer className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Workouts</MachineLabel>
              <MachineText className="ml-auto text-[10px] text-muted-foreground">
                {trends.workouts.length || "none"}
              </MachineText>
            </div>
            {trends.workouts.length ? (
              <ul className="mt-2 space-y-1.5">
                {trends.workouts.map((w) => (
                  <li key={`${w.at}-${w.minutes}`} className="vanta-inset px-3 py-2">
                    <span className="block text-[11.5px] font-medium leading-snug text-foreground">
                      {w.minutes} min · {format(new Date(w.at), "EEE d MMM, HH:mm")}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {SOURCE_LABEL[w.source]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                No workout has arrived in the last fourteen days. Send one from the watch loop page
                to see how it reads.
              </p>
            )}
          </section>

          {/* Posture */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Posture</MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {trends.posture
                ? `You set “${POSTURE_LABEL[trends.posture]}”. Vanta may suggest another; it never switches one for you.`
                : "You haven't set a posture. Vanta reads none rather than guessing one."}
            </p>
          </section>

          <AftermathHint text="Reading these trends changes nothing. Numbers only change how Vanta talks — they never route, approve or run anything." />
        </div>
      )}
    </div>
  );
}
