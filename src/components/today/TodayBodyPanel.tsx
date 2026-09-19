// TodayBodyPanel — your body, on the day's page.
//
// Folded by default and quiet by design. It reads back only what was actually
// measured, says plainly when a sense is off, and never claims a posture Echo
// wasn't told. Nothing here approves or runs anything.
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bluetooth,
  Footprints,
  HeartPulse,
  Loader2,
  Moon,
  Activity,
  Square,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { BodyPatternsPanel } from "@/components/wearables/BodyPatternsPanel";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { useLiveHeartRate } from "@/hooks/useLiveHeartRate";
import { POSTURE_LABEL } from "@/lib/awareness";
import { readingLine, restBalance, workoutList } from "@/lib/wearable";

export function TodayBodyPanel() {
  const { loop, loading, error, refresh } = useWearableLoop();
  const rest = restBalance(loop.readings);
  const hrOn = loop.consent.heart_rate === true;
  const activityOn = loop.consent.activity === true;

  return (
    <CollapsibleSection
      title="Your body"
      storageKey="today.body"
      icon={<Activity className="h-3.5 w-3.5" />}
      defaultOpen={false}
      reading={loop.lastSyncAgo ?? undefined}
      summary={loop.summary || "Your body · nothing switched on yet"}
      action={
        <Link
          to="/how/watch"
          className={cn(
            "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
            MOTION_FOCUS,
          )}
        >
          The watch loop
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
    >
      {error ? (
        <ErrorState error={error} doing="reading your watch" onRetry={refresh} />
      ) : loading ? (
        <LoadingState label="Reading your watch…" />
      ) : !loop.anySensorOn ? (
        <div className="space-y-2">
          <p className="text-[11.5px] leading-snug text-foreground/90">
            No sense is switched on, so Echo knows nothing about your body. Turn on heart rate or
            daily activity and it'll read back here — as context only.
          </p>
          <AftermathHint text="Switching a sense on stores readings you send. It never lets a watch approve or run anything." />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Heart rate</MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {readingLine("heart_rate", loop.heartRate, hrOn)}
            </p>
          </div>

          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Footprints className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Steps today</MachineLabel>
              <MachineText className="text-[10px] text-muted-foreground">
                {activityOn ? (loop.stepsToday !== null ? loop.stepsToday : "nothing yet") : "off"}
              </MachineText>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {loop.stepsToday !== null && activityOn
                ? `${loop.stepsToday} steps recorded today, sent from your phone.`
                : readingLine("steps", null, activityOn)}
            </p>
          </div>

          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Moon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Sleep</MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {readingLine("sleep", loop.sleep, activityOn)}
            </p>
            {activityOn && rest.line ? (
              <p className={cn("mt-1 text-[11px] leading-snug", rest.strained ? "text-amber-400/90" : "text-muted-foreground")}>
                {rest.line}
                {rest.strained ? " Work leads short while that holds." : ""}
              </p>
            ) : null}
          </div>

          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Timer className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Workouts today</MachineLabel>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {!activityOn
                ? "Switched off. Nothing is read and nothing is stored."
                : workoutList(loop.readings, 1).length
                  ? workoutList(loop.readings, 1)
                      .map((w) => `${w.minutes} min`)
                      .join(", ") + " recorded today."
                  : "Nothing has arrived yet. Send one from the watch loop to see how it reads."}
            </p>
          </div>

          <div className="vanta-inset px-3 py-2">
            <MachineLabel className="text-foreground/70">Posture</MachineLabel>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {loop.suggestion
                ? `${loop.suggestion.because} You might be in “${POSTURE_LABEL[loop.suggestion.posture]}”. Set it yourself if that's right.`
                : "Whatever you set by hand. Echo suggests; it never switches."}
            </p>
          </div>

          {/* What the numbers have been doing, the same three strips the Body
              desk shows, from the same calculator. A glance, not a dashboard:
              gaps stay gaps and nothing here is a target or a verdict. */}
          <BodyPatternsPanel variant="today" />

          <AftermathHint text="These numbers only change how Echo talks — shorter when you're moving, quieter when you're training. They never change what needs your approval." />
        </div>
      )}
    </CollapsibleSection>
  );
}
