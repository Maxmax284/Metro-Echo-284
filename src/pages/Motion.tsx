// Motion — how much you moved, and what that does to the Work desk.
//
// Two honest halves:
//   1. Movement recorded: steps today against your own usual, the last
//      workouts, fourteen days of bars. A missing day is a gap, never a zero.
//   2. What it changes: the exact line the Work desk prints in "Where things
//      stand", and whether Vanta is leading short because of your body.
//
// Nothing on this page routes, approves or runs anything. Movement is tone,
// never a driver of work. The Feel controls at the bottom are the same
// per-device motion tokens Settings holds — placed here so the swap between
// "how I moved" and "how the app moves" reads as one idea.
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Activity, Footprints, Timer, Gauge } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { RoomMotionSection } from "@/components/settings/RoomMotionSection";
import { useWearableTrends } from "@/hooks/useWearableTrends";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { POSTURE_LABEL } from "@/lib/awareness";
import { MOTION_FOCUS } from "@/lib/motion";
import { SOURCE_LABEL, workBodyContext } from "@/lib/wearable";

function MoveBars({
  days,
  usual,
}: {
  days: { day: string; steps: number | null }[];
  usual: number | null;
}) {
  const top = Math.max(1, ...days.map((d) => d.steps ?? 0));
  return (
    <div className="mt-2 flex items-end gap-[3px]" role="img" aria-label="Movement by day">
      {days.map((d) => {
        const h = d.steps === null ? 3 : Math.max(4, Math.round((d.steps / top) * 52));
        return (
          <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              title={d.steps === null ? `${d.day} · nothing recorded` : `${d.day} · ${d.steps} steps`}
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
            <span className="font-mono text-[8.5px] text-muted-foreground">{d.day.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MotionPage() {
  const { trends, loading, error, refresh } = useWearableTrends();
  const { loop } = useWearableLoop();
  const { context } = useVantaContext();

  const posture = context.posture ?? null;
  const body = workBodyContext({
    anySensorOn: loop.anySensorOn,
    readings: loop.readings,
    posture,
    sweep: loop.sweep,
    postureActedAt: null,
  });
  const activityOn = trends.consent.activity === true;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/watch"
          aria-label="Back to your watch"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Movement</h1>
          <p className="text-xs text-muted-foreground">
            What was measured, and the one line it changes at the Work desk.
          </p>
        </div>
        <Link
          to="/work"
          className={cn(
            "ml-auto inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
            MOTION_FOCUS,
          )}
        >
          Work desk
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      {error ? (
        <ErrorState error={error} doing="reading your movement" onRetry={refresh} />
      ) : loading ? (
        <LoadingState label="Reading what was measured…" />
      ) : !trends.anySensorOn ? (
        <section className="vanta-card p-4">
          <EmptyState
            title="No sense is switched on"
            hint="Movement is only drawn from records. Turn daily activity on in the watch loop and the first day will appear here."
            actionLabel="Open the watch loop"
            onAction={() => {
              window.location.href = "/wearable-loop";
            }}
          />
        </section>
      ) : (
        <div className="space-y-3">
          {/* What was measured */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Footprints className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Movement · 14 days</MachineLabel>
              <MachineText className="ml-auto text-[10px] text-muted-foreground">
                {activityOn
                  ? trends.stepsUsual !== null
                    ? `usual ${trends.stepsUsual}`
                    : "no history yet"
                  : "off"}
              </MachineText>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {activityOn
                ? trends.stepsLine
                : "Daily activity is off, so steps are not read and not stored."}
            </p>
            {activityOn ? <MoveBars days={trends.days} usual={trends.stepsUsual} /> : null}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              A flat grey bar means nothing was sent that day. Vanta does not read a missing day as
              a still one.
            </p>
          </section>

          {/* Workouts as movement */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Timer className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Hard movement</MachineLabel>
              <MachineText className="ml-auto text-[10px] text-muted-foreground">
                {trends.workouts.length || "none"}
              </MachineText>
            </div>
            {trends.workouts.length ? (
              <ul className="mt-2 space-y-1.5">
                {trends.workouts.slice(0, 4).map((w) => (
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
                No workout has arrived in the last fourteen days, so nothing counts as hard
                movement yet.
              </p>
            )}
          </section>

          {/* The shift, quoted */}
          <section className="vanta-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">
                What the Work desk says because of this
              </MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              This is the exact line "Where things stand" prints right now. It is quoted, not
              rewritten for this page.
            </p>
            <div className="vanta-inset mt-2 flex flex-wrap items-center gap-2 px-3 py-2">
              <Activity className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
              <MachineText className="text-[10px] text-muted-foreground">
                {body.line ?? "Nothing measured yet, so the desk says nothing about your body."}
              </MachineText>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-foreground/90">
              {body.keepShort && body.because
                ? body.because
                : "Work is leading normal length. Nothing in your movement is loud enough to shorten it."}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {posture
                ? `You set “${POSTURE_LABEL[posture]}”. Vanta may suggest another; it never switches one for you.`
                : "You haven't set a posture, so only measured numbers are weighed here."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Link
                to="/work"
                className={cn(
                  "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
                  MOTION_FOCUS,
                )}
              >
                See it at the desk
                <ArrowUpRight className="h-3 w-3" />
              </Link>
              <Link
                to="/watch"
                className={cn(
                  "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
                  MOTION_FOCUS,
                )}
              >
                Full watch trends
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </section>

          {/* How the app itself moves */}
          <RoomMotionSection />

          <AftermathHint text="Reading this changes nothing. Movement only changes how Vanta talks — it never routes, approves or runs anything. Feel is stored on this device alone." />
        </div>
      )}
    </div>
  );
}
