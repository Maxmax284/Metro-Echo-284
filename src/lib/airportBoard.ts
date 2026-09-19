import { flightPhase, type LiveFlight } from "./flightStatus";
import type { GroundStep } from "./groundPath";

export type AirportBoardRead = {
  terminal: string;
  gate: string;
  status: string;
  arrivalSide: boolean;
};

function filed(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "").trim();
  return text || fallback;
}

/** One airport-facing reading. Provider states win; derived steps only explain missing boarding data. */
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
  else if (step === "boarding") status = "BOARDING TIME NOT FILED";
  else if (end.gate) status = "GATE POSTED";
  else if (step === "find_check_in") status = "CHECK-IN";
  else status = "GATE PENDING";

  return {
    terminal: filed(end.terminal, "NOT FILED"),
    gate: filed(end.gate, "NOT FILED"),
    status,
    arrivalSide,
  };
}