import { airportPoint, type Point } from "@/lib/airports";
import type { Layover, Leg } from "@/lib/journey";

export type AirportLayoverFacts = {
  iata: string | null;
  point: Point | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
  onwardTerminal: string | null;
  onwardGate: string | null;
  checkedAt: string | null;
};

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text || null;
};

export function airportLayoverFacts(layover: Layover, nextLeg: Leg): AirportLayoverFacts {
  const iata = clean(layover.iata)?.toUpperCase() ?? null;
  return {
    iata,
    point: airportPoint(iata),
    arrivalTerminal: clean(layover.arriveTerminal),
    arrivalGate: null,
    onwardTerminal: clean(nextLeg.from.terminal),
    onwardGate: clean(nextLeg.from.gate),
    checkedAt: nextLeg.live_checked_at,
  };
}

export const AIRPORT_GEOMETRY_WORDS = {
  map: "Real airport map · terminal and gate facts are labels, not map pins.",
  walking: "Walking distance unavailable — no indoor route geometry is on record.",
  taxi: "Taxi-out distance unavailable — no provider ground track is on record.",
  offline: "The live map is unavailable. Filed terminal and gate facts remain below.",
} as const;
