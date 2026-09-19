// FlightLive — the flight deck: the reading, drawn so you can feel it at a glance.
//
// Doctrine:
//   - Motion never invents position. When the provider carried no times, the
//     arc draws dashed, no plane is shown, and the deck says so in words.
//   - The split-flap board flips only when the wording genuinely changed.
//   - The pulse means "this is a live reading", and the reading's age sits right
//     next to it so nobody mistakes an old check for now.
//   - Colour is a shortcut, never the message. Every state is also written out.
import { useMemo, type ReactNode } from "react";
import {
  PHASE_WORDS,
  altitudeWords,
  climbWords,
  fixWords,
  flightPhase,
  headingWords,
  readingAge,
  speedWords,
  statusWords,
  trackProgress,
  type LiveFlight,
} from "@/lib/flightStatus";
import { airportBoardRead } from "@/lib/airportBoard";
import type { GroundStep } from "@/lib/groundPath";
import type { ConnectionRead } from "@/lib/connectionRead";

import { cn } from "@/lib/utils";
import { AirportClock } from "./AirportClock";
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
  homeZone,
  reading = false,
  board,
  ticket,
  groundStep,
  connection = null,
  embedded = false,
  belowBoard,
}: {
  live: LiveFlight;
  checkedAt: string | null;
  clock: (iso: string) => string;
  /** The clock Echo is keeping, so a landing can state the shift honestly. */
  homeZone?: string | null;
  /** True while a fresh read is in flight — the deck breathes instead of freezing. */
  reading?: boolean;
  /**
   * What the terminal prints — the operating airline's number. The board shows
   * this, never the ticket number, because the ticket number is not up there.
   */
  board?: string | null;
  /** The ticket number, named once and quietly, when it differs from the board. */
  ticket?: string | null;
  /** The current practical airport step; used only when the provider did not file boarding. */
  groundStep?: GroundStep | null;
  /** Set when this landing is a connection, so the city pack stands down. */
  connection?: ConnectionRead | null;
  /** Removes the surrounding panel when the deck already sits inside the active-flight card. */
  embedded?: boolean;
  /** Sits directly under the board row — the terminal walk opens from there. */
  belowBoard?: ReactNode;
}) {

  const phase = flightPhase(live);
  /* Radar first: when the airline filed a fix for the aircraft, the marker sits
     where the aircraft is. Otherwise the clock draws it, and the card says which. */
  const track = trackProgress(live);
  const progress = track.value;
  const pos = live.position ?? null;
  const telemetry = [
    { label: "Altitude", text: altitudeWords(pos) },
    { label: "Speed", text: speedWords(pos) },
    { label: "Heading", text: headingWords(pos) },
  ].filter((c): c is { label: string; text: string } => !!c.text);
  const climb = climbWords(pos);
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

  const airportBoard = airportBoardRead(live, groundStep);

  return (
    <div
      className={cn(
        "animate-slide-up space-y-2.5",
        !embedded && "rounded-md border border-border/60 bg-muted/20 p-2.5",
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

      {/* The board: what the terminal prints, status, gate. Flips once when the
          wording changes. The ticket number sits under it, said once. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <SolariBoard text={board?.trim() || live.flight_no} label="Flight" />
        <SolariBoard text={airportBoard.terminal} label={airportBoard.arrivalSide ? "Arrival terminal" : "Terminal"} />
        <SolariBoard text={airportBoard.gate} label={airportBoard.arrivalSide ? "Arrival gate" : "Gate"} tone={airportBoard.gate === "NOT FILED" ? "default" : "primary"} />
        <SolariBoard
          text={airportBoard.status}
          label="Status"
          tone={airportBoard.status === "CANCELLED" || airportBoard.status === "DIVERTED" ? "danger" : airportBoard.status === "LANDED" ? "good" : airportBoard.status.includes("NOT FILED") ? "warn" : BOARD_TONE[phase]}
        />
      </div>
      {ticket?.trim() && ticket.trim().toUpperCase() !== (board ?? live.flight_no).toUpperCase() && (
        <p className="text-[10.5px] text-muted-foreground/80">Your ticket says {ticket.trim()}.</p>
      )}
      {/* A gate kept from an earlier reading says so, with when it was read. The
          airline going quiet is not the airline withdrawing a gate. */}
      {airportBoard.gateSince && (
        <p className="text-[10.5px] text-muted-foreground/80">
          That gate is the last one the airline filed, {readingAge(airportBoard.gateSince)}. This reading did not
          mention it.
        </p>
      )}
      {belowBoard}

      {/* The track. The marker sits on the aircraft's own fix when there is one,
          on the clock when there isn't, and nowhere at all when neither holds. */}
      <FlightArc
        from={from}
        to={to}
        progress={progress}
        phase={phase}
        instantAt={instantAt}
        clock={clock}
        live={track.source === "radar"}
        heading={pos?.heading_deg ?? null}
      />
      {progress === null && (
        <p className="text-[10.5px] text-muted-foreground/80">
          No position drawn — the airline filed no fix and no times for both ends.
        </p>
      )}

      {/* The aircraft's own numbers. Only what the airline filed, never filled in. */}
      {telemetry.length > 0 && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          {telemetry.map((c) => (
            <SolariBoard key={c.label} text={c.text} label={c.label} tone="primary" />
          ))}
          {climb && <SolariBoard text={climb.toUpperCase()} label="Vertical" />}
        </div>
      )}
      {fixWords(pos) && <p className="text-[10.5px] text-muted-foreground/80">{fixWords(pos)}</p>}
      {!pos && phase === "flying" && (
        <p className="text-[10.5px] text-muted-foreground/80">
          No radar fix from the airline yet — the track is worked out from the filed times.
        </p>
      )}

      <p className="text-[11.5px] text-foreground/85">{statusWords(live, clock)}</p>

      {/* The ground you are standing on: the clock at this flight's own departure
          airport, live, from the moment the trip is on until you have landed.
          It states the difference from your clock; it never switches it. */}
      {live.departure.iata && phase !== "landed" && (
        <AirportClock
          iata={live.departure.iata}
          homeZone={homeZone}
          label={phase === "flying" ? "Time where you left" : "Local time at the gate"}
        />
      )}

      {/* The ground you are heading for — its clock, its money, its number —
          read from this flight's own arrival airport. Inked only once landed. */}
      {live.arrival.iata && (
        <ArrivalStamp
          iata={live.arrival.iata}
          at={arrIso}
          homeZone={homeZone}
          arrived={phase === "landed"}
          connection={connection}
        />
      )}

    </div>
  );
}
