// BodyPatternsPanel — the whole body read, from recorded readings only.
//
// Today's line on top (the flight-strip / day-rail feel), the fortnight in bar
// strips underneath, then where you stand: heart, sleep, movement, steps,
// energy, standing, weight and BMI.
//
// Truth rules, all enforced by the maths in `@/lib/wearable`:
//   - A day nothing arrived is an empty slot, never a bar at zero.
//   - "Usual" is this person's own history, never a published ideal.
//   - BMI is arithmetic shown back. No category, no band, no colour, no range.
//   - Nothing here is a target, a score, a verdict or advice.
//
// Two sizes, one component: the desk gets the roomy read, Today the tighter one.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Flame, Footprints, HeartPulse, Moon, Scale, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_ARRIVE } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { BodyLiveStrip } from "@/components/wearables/BodyLiveStrip";
import { useWearableTrends } from "@/hooks/useWearableTrends";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { sanitizeBodyProfile } from "@/lib/bodyProfile";
import {
  bmiLine,
  energyByDay,
  formatMinutes,
  heartByDay,
  heartCompare,
  seriesCompare,
  standByDay,
  weightMove,
  weightSeries,
} from "@/lib/wearable";

/** One strip of days. Null is drawn as an empty slot, never a floor value. */
function Strip({ values, tint, tall }: { values: (number | null)[]; tint: string; tall: boolean }) {
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div className={cn("mt-1.5 flex items-end gap-[3px]", tall ? "h-10" : "h-7")} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-[1px]",
            MOTION_ARRIVE,
            v === null ? "border border-dashed border-border/60 bg-transparent" : tint,
          )}
          style={{ height: v === null ? "100%" : `${Math.max(6, (v / top) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Row({
  Icon,
  label,
  line,
  values,
  tint,
  tall,
}: {
  Icon: typeof Activity;
  label: string;
  line: string;
  values?: (number | null)[];
  tint?: string;
  tall: boolean;
}) {
  const recorded = values ? values.filter((v) => v !== null).length : 0;
  return (
    <div className="vanta-inset px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">{label}</MachineLabel>
        {values ? (
          <MachineText className="ml-auto text-[10px] text-muted-foreground">
            {recorded} of {values.length} days recorded
          </MachineText>
        ) : null}
      </div>
      <p className={cn("mt-1 leading-snug text-foreground/90", tall ? "text-[12px]" : "text-[11.5px]")}>
        {line}
      </p>
      {values && recorded > 0 && tint ? <Strip values={values} tint={tint} tall={tall} /> : null}
    </div>
  );
}

export function BodyPatternsPanel({ variant = "desk" }: { variant?: "desk" | "today" }) {
  const onDesk = variant === "desk";
  const tall = onDesk;
  const { trends, loading, error, refresh } = useWearableTrends(14);
  const { prefs } = useUserPreferences();

  const heightCm = useMemo(
    () => sanitizeBodyProfile((prefs as any).body_profile).height_cm ?? null,
    [prefs],
  );

  const heart = useMemo(() => heartByDay(trends.readings, 14), [trends.readings]);
  const energy = useMemo(() => energyByDay(trends.readings, 14), [trends.readings]);
  const standing = useMemo(() => standByDay(trends.readings, 14), [trends.readings]);
  const weight = useMemo(() => weightSeries(trends.readings, 14), [trends.readings]);

  const weekWorkouts = trends.workouts.filter(
    (w) => Date.now() - new Date(w.at).getTime() < 7 * 86_400_000,
  );

  if (loading) return <LoadingState label="Reading the last fortnight…" />;
  if (error) return <ErrorState error={error} doing="reading your body patterns" onRetry={refresh} />;

  const nothing = !trends.readings.length;

  const missing = (
    <p className="text-[11.5px] leading-snug text-muted-foreground">
      Nothing has arrived yet. Point your phone's health export at your private link on the Wearables
      page and readings land here on their own — Echo never reaches out to a device.
    </p>
  );

  const body = (
    <>
      {/* Today, on a moving line — same feel as the flight strip and day rail. */}
      <BodyLiveStrip readings={trends.readings} timezone={prefs.timezone ?? undefined} tall={tall} />

      {/* The fortnight, in bars. */}
      <Row Icon={HeartPulse} label="Heart" line={heartCompare(heart)} values={heart} tint="bg-primary/70" tall={tall} />
      <Row
        Icon={Moon}
        label="Sleep"
        line={trends.sleepLine}
        values={trends.nights.map((n) => n.minutes)}
        tint="bg-primary/45"
        tall={tall}
      />
      <Row
        Icon={Footprints}
        label="Steps"
        line={trends.stepsLine}
        values={trends.days.map((d) => d.steps)}
        tint="bg-primary/60"
        tall={tall}
      />
      <Row
        Icon={Flame}
        label="Energy"
        line={seriesCompare(energy, "kcal", "No energy reading has arrived yet.")}
        values={energy}
        tint="bg-primary/55"
        tall={tall}
      />
      <Row
        Icon={Activity}
        label="Standing"
        line={seriesCompare(standing, "hours", "No standing record has arrived yet.")}
        values={standing}
        tint="bg-primary/40"
        tall={tall}
      />

      {/* Weight and the arithmetic on top of it. No label goes on either. */}
      <Row Icon={Scale} label="Weight" line={weightMove(weight)} tall={tall} />
      <Row Icon={Scale} label="BMI" line={bmiLine(weight, heightCm)} tall={tall} />

      <Row
        Icon={Timer}
        label="Sessions"
        line={
          weekWorkouts.length
            ? `${weekWorkouts.length} recorded in the last seven days, ${formatMinutes(
                weekWorkouts.reduce((s, w) => s + w.minutes, 0),
              )} in total.`
            : "Nothing recorded in the last seven days."
        }
        tall={tall}
      />
    </>
  );

  const law = (
    <p className={cn("leading-snug text-muted-foreground", tall ? "mt-2.5 text-[11px]" : "mt-2 text-[11px]")}>
      These are your own numbers against your own history. Echo says what changed and stops there — no
      target, no score, no advice, and no label on any figure. A day with nothing sent stays a gap.
    </p>
  );

  /* Today: the same read, no second card around it. */
  if (!onDesk) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <MachineLabel className="text-foreground/70">This fortnight</MachineLabel>
          <Link
            to="/?surface=schedule&tab=body"
            className="vanta-focus ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40"
          >
            The Body desk
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {nothing ? missing : body}
        {nothing ? null : law}
      </div>
    );
  }

  return (
    <section className="vanta-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <MachineLabel className="text-foreground/70">This fortnight</MachineLabel>
        <Link
          to="/how/trends"
          className="vanta-focus ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40"
        >
          The longer read
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {nothing ? <div className="mt-2">{missing}</div> : <div className="mt-2 space-y-2">{body}</div>}
      {law}
    </section>
  );
}
