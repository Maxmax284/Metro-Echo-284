// BodyLiveStrip — today's readings on a moving line.
//
// Same feel as the flight strip and the day rail, and deliberately the same
// helpers: markers are spread with `spreadMarkers` so labels never stack, the
// rail widens with `railWidthFor` and scrolls sideways on a phone, and "now"
// sits where now actually is.
//
// Truth rules: only readings that arrived today are drawn. A day with nothing
// sent draws no markers and says so — never an invented position. Nothing here
// is a target, a score or a verdict.
import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Footprints, Flame, HeartPulse, Moon, Scale, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_ARRIVE, MOTION_FLIP } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { railWidthFor, spreadMarkers } from "@/lib/agendaBoard";
import { KIND_LABEL, todayClock, type Reading, type ReadingKind } from "@/lib/wearable";

const ICON: Partial<Record<ReadingKind, typeof Activity>> = {
  heart_rate: HeartPulse,
  resting_heart_rate: HeartPulse,
  sleep: Moon,
  steps: Footprints,
  calories: Flame,
  workout: Timer,
  weight: Scale,
  stand: Activity,
};

function clock(at: string, timezone?: string): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || undefined,
    });
  } catch {
    return new Date(at).toISOString().slice(11, 16);
  }
}

function shown(value: number, unit: string, kind: ReadingKind): string {
  if (kind === "sleep") {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function BodyLiveStrip({
  readings,
  timezone,
  tall = true,
}: {
  readings: Reading[];
  timezone?: string;
  tall?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  /* A minute is fine: readings arrive on their own schedule, not per second. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const state = useMemo(() => todayClock(readings, now), [readings, now]);

  /* A slot per reading, wide enough that a label never lands on its neighbour.
     On a phone the rail scrolls sideways rather than squeezing the words. */
  const gap = tall ? 116 : 112;
  const width = railWidthFor(Math.max(1, state.markers.length), gap);
  const placed = useMemo(
    () => spreadMarkers(state.markers.map((m) => m.percent), width, gap),
    [state.markers, width, gap],
  );

  return (
    <div className="vanta-inset px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">Today, as it arrived</MachineLabel>
        {state.markers.length ? (
          <MachineText className="ml-auto text-[10px] text-muted-foreground">
            {clock(state.markers[0].at, timezone)} → {clock(state.markers[state.markers.length - 1].at, timezone)}
          </MachineText>
        ) : null}
      </div>

      <p className={cn("mt-1 leading-snug text-foreground/90", tall ? "text-[12px]" : "text-[11.5px]")}>
        {state.line}
      </p>

      {state.markers.length ? (
        <div className="mt-2 -mx-1 overflow-x-auto pb-1">
          <div className="relative px-1" style={{ width, height: tall ? 62 : 52 }}>
            {/* The line itself. */}
            <span
              aria-hidden
              className="absolute left-1 right-1 top-3 h-[2px] rounded-full bg-border/70"
            />

            {/* Where now sits, when now is inside the span. */}
            {state.nowPercent !== null ? (
              <span
                aria-hidden
                className={cn("absolute top-[5px] h-[10px] w-[2px] rounded-full bg-accent", MOTION_FLIP)}
                style={{ left: `calc(${(state.nowPercent / 100) * width}px + 4px)` }}
              />
            ) : null}

            {state.markers.map((m, i) => {
              const Icon = ICON[m.kind] ?? Activity;
              return (
                <div
                  key={`${m.kind}-${m.at}-${i}`}
                  className={cn("absolute top-0 flex w-[104px] flex-col items-start", MOTION_ARRIVE)}
                  style={{ left: Math.max(0, placed[i] - 6) }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-2.5 w-2.5 rounded-full ring-2 ring-background",
                      m.newest ? "bg-primary" : "bg-primary/50",
                    )}
                    style={{ marginTop: 4 }}
                  />
                  <span className="mt-1.5 flex w-full items-center gap-1">
                    <Icon className="h-3 w-3 shrink-0 text-primary/80" aria-hidden />
                    <MachineText className="truncate text-[10px] text-foreground/85">
                      {shown(m.value, m.unit, m.kind)}
                    </MachineText>
                  </span>
                  <span className="w-full truncate text-[9.5px] leading-tight text-muted-foreground">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </span>
                  <span className="w-full truncate text-[9.5px] leading-tight text-muted-foreground/80">
                    {clock(m.at, timezone)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
