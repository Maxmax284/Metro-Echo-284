import { flightPhase, isCarried, type LiveFlight } from "./flightStatus";
import type { GroundStep } from "./groundPath";

export type AirportBoardRead = {
  terminal: string;
  gate: string;
  status: string;
  arrivalSide: boolean;
  /** Set when the gate shown was kept from an earlier reading, with its date. */
  gateSince: string | null;
};

function filed(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "").trim();
  return text || fallback;
}

/**
 * One airport-facing reading. Every state on this board is the airline's own
 * word or a plain statement that nothing is filed. Boarding is never derived
 * from the clock: a departure time going past is not an airline saying boarding.
 */
export function airportBoardRead(live: LiveFlight, step?: GroundStep | null): AirportBoardRead {
  const phase = flightPhase(live);
  const arrivalSide = phase === "flying" || phase === "landed";
  const end = arrivalSide ? live.arrival : live.departure;
  const provider = (live.status ?? "").trim().toLowerCase();
  let status = "SCHEDULED";
  if (provider === "cancelled") status = "CANCELLED";
  else if (provider === "diverted") status = "DIVERTED";
  else if (phase === "landed") status = "LANDED";
  else if (phase === "flying") status = "EN ROUTE";
  else if (provider === "boarding") status = "BOARDING";
  else if (end.gate) status = "GATE POSTED";
  else if (step === "find_check_in") status = "CHECK-IN";
  else status = "GATE PENDING";

  const kept = isCarried(live, arrivalSide ? "arrival.gate" : "departure.gate");
  return {
    terminal: filed(end.terminal, "NOT FILED"),
    gate: filed(end.gate, "NOT FILED"),
    status,
    arrivalSide,
    gateSince: kept?.since ?? null,
  };
}