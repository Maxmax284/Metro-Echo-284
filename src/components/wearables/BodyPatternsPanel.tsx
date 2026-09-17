// BodyPatternsPanel — heart, sleep and movement over the last fortnight.
//
// Every number here comes from a recorded reading. A day nothing arrived is a
// gap in the strip, never a zero bar, and "usual" is this person's own history
// rather than a published ideal. Observation only: no target, no score, no
// advice. The maths lives in `@/lib/wearable` so this panel, the Body desk,
// Today's quiet panel and Ask all say the same thing.
//
// Two sizes, one component. The desk gets the full read; Today gets the same
// three strips, tighter and without a second card around them — Today stays a
// glance, not a dashboard.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Moon, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_ARRIVE } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { useWearableTrends } from "@/hooks/useWearableTrends";
import { formatMinutes, heartByDay, heartCompare } from "@/lib/wearable";

/** One strip of days. Null is drawn as an empty slot, never as a floor value. */
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
  values: (number | null)[];
  tint: string;
  tall: boolean;
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
      <p className={cn("mt-1 leading-snug text-foreground/90", tall ? "text-[12px]" : "text-[11.5px]")}>
        {line}
      </p>
      {recorded > 0 ? <Strip values={values} tint={tint} tall={tall} /> : null}
    </div>
  );
}

export function BodyPatternsPanel({ variant = "desk" }: { variant?: "desk" | "today" }) {
  const onDesk = variant === "desk";
  const { trends, loading, error, refresh } = useWearableTrends(14);

  const heartLevels = useMemo(() => heartByDay(trends.readings, 14), [trends.readings]);
  const heartLine = useMemo(() => heartCompare(heartLevels), [heartLevels]);

  const weekWorkouts = trends.workouts.filter(
    (w) => Date.now() - new Date(w.at).getTime() < 7 * 86_400_000,
  );

  if (loading) return <LoadingState label="Reading the last fortnight…" />;
  if (error) return <ErrorState error={error} doing="reading your body patterns" onRetry={refresh} />;

  const nothing =
    !trends.readings.length ||
    (!trends.days.some((d) => d.steps !== null) &&
      !trends.nights.some((n) => n.minutes !== null) &&
      !heartLevels.some((v) => v !== null));

  const strips = (
    <>
      <Row
        Icon={HeartPulse}
        label="Heart"
        line={heartLine}
        values={heartLevels}
        tint="bg-primary/70"
        tall={onDesk}
      />
      <Row
        Icon={Moon}
        label="Sleep"
        line={trends.sleepLine}
        values={trends.nights.map((n) => n.minutes)}
        tint="bg-primary/45"
        tall={onDesk}
      />
      <Row
        Icon={Activity}
        label="Movement"
        line={trends.stepsLine}
        values={trends.days.map((d) => d.steps)}
        tint="bg-primary/60"
        tall={onDesk}
      />
    </>
  );

  const missing = (
    <p className="text-[11.5px] leading-snug text-muted-foreground">
      Nothing has arrived yet. Point your phone's health export at your private link on the Wearables
      page and readings land here on their own — Echo never reaches out to a device.
    </p>
  );

  /* Today: the same three strips, no second card, no extra chrome. */
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
        {nothing ? missing : strips}
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

      {nothing ? (
        <div className="mt-2">{missing}</div>
      ) : (
        <div className="mt-2 space-y-2">
          {strips}
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
