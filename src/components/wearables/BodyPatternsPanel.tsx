// BodyPatternsPanel — heart, sleep and movement over the last fortnight.
//
// Every number here comes from a recorded reading. A day nothing arrived is a
// gap in the strip, never a zero bar, and "usual" is this person's own history
// rather than a published ideal. Observation only: no target, no score, no
// advice. The maths lives in `@/lib/wearable` so this panel, the trends page,
// Today and Ask all say the same thing.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Moon, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_ARRIVE } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { useWearableTrends } from "@/hooks/useWearableTrends";
import { formatMinutes } from "@/lib/wearable";

/** One strip of days. Null is drawn as an empty slot, never as a floor value. */
function Strip({ values, tint }: { values: (number | null)[]; tint: string }) {
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div className="mt-1.5 flex h-10 items-end gap-[3px]" aria-hidden>
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
}: {
  Icon: typeof Activity;
  label: string;
  line: string;
  values: (number | null)[];
  tint: string;
}) {
  const recorded = values.filter((v) => v !== null).length;
  return (
    <div className="vanta-inset px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">{label}</MachineLabel>
        <MachineText className="ml-auto text-[10px] text-muted-foreground">
          {recorded} of {values.length} days recorded
        </MachineText>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-foreground/90">{line}</p>
      {recorded > 0 ? <Strip values={values} tint={tint} /> : null}
    </div>
  );
}

export function BodyPatternsPanel() {
  const { trends, loading, error, refresh } = useWearableTrends(14);

  const heartByDay = useMemo(() => {
    /* One level per day: the median of that day's readings, so a single spike
       during a session does not stand in for the whole day. */
    const byDay = new Map<string, number[]>();
    for (const r of trends.readings) {
      if (r.kind !== "heart_rate" && r.kind !== "resting_heart_rate") continue;
      const k = r.measured_at.slice(0, 10);
      byDay.set(k, [...(byDay.get(k) ?? []), r.value]);
    }
    return trends.days.map((d) => {
      const xs = (byDay.get(d.day) ?? []).sort((a, b) => a - b);
      if (!xs.length) return null;
      return Math.round(xs[Math.floor(xs.length / 2)]);
    });
  }, [trends.readings, trends.days]);

  const heartLine = useMemo(() => {
    const recorded = heartByDay.filter((v) => v !== null) as number[];
    if (!recorded.length) return "No heart reading has arrived yet.";
    const last = heartByDay.slice().reverse().find((v) => v !== null)!;
    const usual = [...recorded].sort((a, b) => a - b)[Math.floor(recorded.length / 2)];
    if (recorded.length < 3) return `${last} bpm most recently. Not enough days to know your usual yet.`;
    const diff = last - usual;
    if (Math.abs(diff) < Math.max(3, usual * 0.05)) {
      return `${last} bpm most recently — about your usual ${usual}.`;
    }
    return diff > 0
      ? `${last} bpm most recently, ${diff} above your usual ${usual}.`
      : `${last} bpm most recently, ${Math.abs(diff)} below your usual ${usual}.`;
  }, [heartByDay]);

  const weekWorkouts = trends.workouts.filter(
    (w) => Date.now() - new Date(w.at).getTime() < 7 * 86_400_000,
  );

  if (loading) return <LoadingState label="Reading the last fortnight…" />;
  if (error) return <ErrorState error={error} doing="reading your body patterns" onRetry={refresh} />;

  const nothing =
    !trends.readings.length ||
    (!trends.days.some((d) => d.steps !== null) &&
      !trends.nights.some((n) => n.minutes !== null) &&
      !heartByDay.some((v) => v !== null));

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

      {nothing ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Nothing has arrived yet. Point your phone's health export at your private link on the
          Wearables page and readings land here on their own — Echo never reaches out to a device.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <Row
            Icon={HeartPulse}
            label="Heart"
            line={heartLine}
            values={heartByDay}
            tint="bg-primary/70"
          />
          <Row
            Icon={Moon}
            label="Sleep"
            line={trends.sleepLine}
            values={trends.nights.map((n) => n.minutes)}
            tint="bg-primary/45"
          />
          <Row
            Icon={Activity}
            label="Movement"
            line={trends.stepsLine}
            values={trends.days.map((d) => d.steps)}
            tint="bg-primary/60"
          />
          <div className="vanta-inset px-3 py-2">
            <MachineLabel className="text-foreground/70">Sessions</MachineLabel>
            <p className="mt-1 text-[12px] leading-snug text-foreground/90">
              {weekWorkouts.length
                ? `${weekWorkouts.length} recorded in the last seven days, ${formatMinutes(
                    weekWorkouts.reduce((s, w) => s + w.minutes, 0),
                  )} in total.`
                : "Nothing recorded in the last seven days."}
            </p>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
        These are your own numbers against your own history. Echo says what changed and stops there —
        no target, no score, no advice. A day with nothing sent stays a gap.
      </p>
    </section>
  );
}
