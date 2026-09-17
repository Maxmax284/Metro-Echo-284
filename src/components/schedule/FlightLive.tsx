// FlightLive — the reading, drawn so you can feel it at a glance.
//
// Doctrine:
//   - Motion never invents position. When the provider carried no times, the
//     strip shows no plane and says so in words.
//   - The pulse means "this is a live reading", and the reading's age sits right
//     next to it so nobody mistakes an old check for now.
//   - Colour is a shortcut, never the message. Every state is also written out.
import { Plane } from "lucide-react";
import {
  PHASE_WORDS,
  flightPhase,
  flightProgress,
  readingAge,
  statusWords,
  type LiveFlight,
} from "@/lib/flightStatus";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  waiting: "bg-primary/70",
  flying: "bg-primary",
  landed: "bg-emerald-400/80",
  stopped: "bg-destructive/80",
  unknown: "bg-muted-foreground/60",
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
  /** True while a fresh read is in flight — the strip breathes instead of freezing. */
  reading?: boolean;
}) {
  const phase = flightPhase(live);
  const progress = flightProgress(live);
  const from = live.departure.iata ?? "—";
  const to = live.arrival.iata ?? "—";
  const pct = progress === null ? null : Math.round(progress * 100);

  return (
    <div
      className={cn(
        "animate-slide-up space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5",
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

      {/* The runway. Drawn only when both ends carried a time. */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-foreground/80">
          <span className="font-medium tracking-wide">{from}</span>
          <div className="relative h-5 flex-1">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            {pct !== null && (
              <>
                <div
                  className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-primary/70 transition-[width] duration-[1200ms] ease-out"
                  style={{ width: `${pct}%` }}
                />
                <Plane
                  className={cn(
                    "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-primary transition-[left] duration-[1200ms] ease-out",
                    phase === "flying" && "animate-plane-drift",
                  )}
                  style={{ left: `${pct}%` }}
                  aria-hidden
                />
              </>
            )}
          </div>
          <span className="font-medium tracking-wide">{to}</span>
        </div>
        {pct === null && (
          <p className="text-[10.5px] text-muted-foreground/80">
            No position drawn — the provider carried no times for both ends.
          </p>
        )}
      </div>

      <p className="text-[11.5px] text-foreground/85">{statusWords(live, clock)}</p>
      {(live.departure.gate || live.departure.terminal) && (
        <div className="flex flex-wrap gap-1.5">
          {live.departure.terminal && (
            <span className="animate-slide-up rounded border border-border/60 px-1.5 py-0.5 text-[10.5px] text-foreground/80">
              Terminal {live.departure.terminal}
            </span>
          )}
          {live.departure.gate && (
            <span className="animate-slide-up rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10.5px] text-foreground">
              Gate {live.departure.gate}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
