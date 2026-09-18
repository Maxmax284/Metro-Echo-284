// FlightLive — the flight deck: the reading, drawn so you can feel it at a glance.
//
// Doctrine:
//   - Motion never invents position. When the provider carried no times, the
//     arc draws dashed, no plane is shown, and the deck says so in words.
//   - The split-flap board flips only when the wording genuinely changed.
//   - The pulse means "this is a live reading", and the reading's age sits right
//     next to it so nobody mistakes an old check for now.
//   - Colour is a shortcut, never the message. Every state is also written out.
import { useMemo } from "react";
import {
  PHASE_WORDS,
  flightPhase,
  flightProgress,
  readingAge,
  statusWords,
  type LiveFlight,
} from "@/lib/flightStatus";
import { cn } from "@/lib/utils";
import { ArrivalStamp } from "./ArrivalStamp";
import { FlightArc } from "./FlightArc";
import { SolariBoard } from "./SolariBoard";

const TONE: Record<string, string> = {
  waiting: "bg-primary/70",
  flying: "bg-primary",
  landed: "bg-emerald-400/80",
  stopped: "bg-destructive/80",
  unknown: "bg-muted-foreground/60",
};

const BOARD_WORDS: Record<string, string> = {
  waiting: "ON THE GROUND",
  flying: "EN ROUTE",
  landed: "LANDED",
  stopped: "NOT FLYING",
  unknown: "NO POSITION",
};

const BOARD_TONE: Record<string, "primary" | "good" | "danger" | "default"> = {
  waiting: "primary",
  flying: "primary",
  landed: "good",
  stopped: "danger",
  unknown: "default",
};

export function FlightLive({
  live,
  checkedAt,
  clock,
  reading = false,
}: {
  live: LiveFlight;
  checkedAt: string | null;
  clock: (iso: string) => string;
  /** True while a fresh read is in flight — the deck breathes instead of freezing. */
  reading?: boolean;
}) {
  const phase = flightPhase(live);
  const progress = flightProgress(live);
  const from = live.departure.iata ?? "—";
  const to = live.arrival.iata ?? "—";

  const depIso = live.departure.actual ?? live.departure.estimated ?? live.departure.scheduled;
  const arrIso = live.arrival.actual ?? live.arrival.estimated ?? live.arrival.scheduled;

  /* An instant anywhere along the trip, only where both ends carried a time. */
  const instantAt = useMemo(() => {
    if (!depIso || !arrIso) return undefined;
    const a = Date.parse(depIso);
    const b = Date.parse(arrIso);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return undefined;
    return (t: number) => new Date(a + (b - a) * Math.max(0, Math.min(1, t))).toISOString();
  }, [depIso, arrIso]);

  const gate = live.departure.gate
    ? `GATE ${live.departure.gate}`
    : live.departure.terminal
      ? `TERM ${live.departure.terminal}`
      : null;

  return (
    <div
      className={cn(
        "animate-slide-up space-y-2.5 rounded-md border border-border/60 bg-muted/20 p-2.5",
        reading && "animate-pulse",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-70",
              TONE[phase],
              phase === "flying" && "animate-live-ping",
            )}
          />
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", TONE[phase])} />
        </span>
        <p className="vanta-machine-label text-foreground/70">{PHASE_WORDS[phase]}</p>
        {checkedAt && (
          <p className="ml-auto text-[10.5px] text-muted-foreground/80">{readingAge(checkedAt)}</p>
        )}
      </div>

      {/* The board: flight, status, gate. Flips once when the wording changes. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <SolariBoard text={live.flight_no} label="Flight" />
        <SolariBoard text={BOARD_WORDS[phase] ?? "STATUS"} label="Status" tone={BOARD_TONE[phase]} />
        {gate && <SolariBoard text={gate} label="Stand" tone="primary" />}
      </div>

      {/* The track. Drawn with a position only when both ends carried a time. */}
      <FlightArc
        from={from}
        to={to}
        progress={progress}
        phase={phase}
        instantAt={instantAt}
        clock={clock}
      />
      {progress === null && (
        <p className="text-[10.5px] text-muted-foreground/80">
          No position drawn — the provider carried no times for both ends.
        </p>
      )}

      <p className="text-[11.5px] text-foreground/85">{statusWords(live, clock)}</p>
    </div>
  );
}
