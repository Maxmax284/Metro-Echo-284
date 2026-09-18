// travelSense — the arithmetic around a flight that a person actually asks for:
// when to leave, and what the clock does to them when they land.
//
// Doctrine:
//   - Arithmetic only. Every cushion Echo applies is said out loud as an
//     assumption, so it can be argued with.
//   - No filed departure time means no leave time. It says what it needs.
//   - A ride time Echo was not given is not invented. It gives the be-at-the-
//     airport time and asks for the ride.
//   - An airport not in the kept table has no clock. Echo says so.
//
// Pure module: no IO, no React.

import { airport, airportWords, bordersCrossed } from "./airports.ts";

export const TRAVEL_SENSE_LAW =
  "Echo does the arithmetic and names what it assumed. It never books the ride and never invents a time it was not given.";

/** Airport cushions, in minutes, before a filed departure. */
export const CUSHION_MIN = { domestic: 120, international: 180, unknown: 150 } as const;

export type LeaveRead = {
  /** When to walk out the door. Null when the ride time is unknown. */
  leaveAt: string | null;
  /** When to be at the airport. Null when there is no filed departure. */
  airportBy: string | null;
  cushionMin: number;
  rideMinutes: number | null;
  crossing: "same" | "different" | "unknown";
  assumptions: string[];
  words: string;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * When to leave for a flight.
 *
 * `clock` renders an instant the way the person reads time; the default keeps
 * it in UTC so tests are not at the mercy of a machine's zone.
 */
export function leaveForFlight(
  input: {
    departAt: string | null | undefined;
    fromIata?: string | null;
    toIata?: string | null;
    rideMinutes?: number | null;
  },
  clock: (isoTime: string) => string = (t) => `${t.slice(11, 16)} UTC`,
): LeaveRead {
  const dep = input.departAt ? Date.parse(input.departAt) : NaN;
  const crossing = bordersCrossed(input.fromIata ?? null, input.toIata ?? null);
  const cushionMin =
    crossing === "different"
      ? CUSHION_MIN.international
      : crossing === "same"
        ? CUSHION_MIN.domestic
        : CUSHION_MIN.unknown;
  const ride =
    typeof input.rideMinutes === "number" && Number.isFinite(input.rideMinutes) && input.rideMinutes >= 0
      ? Math.round(input.rideMinutes)
      : null;

  if (!Number.isFinite(dep)) {
    return {
      leaveAt: null,
      airportBy: null,
      cushionMin,
      rideMinutes: ride,
      crossing,
      assumptions: [],
      words: "No filed departure time on record, so there is no leave time to work out. Add the time it leaves.",
    };
  }

  const airportBy = iso(dep - cushionMin * 60_000);
  const leaveAt = ride != null ? iso(dep - (cushionMin + ride) * 60_000) : null;

  const assumptions = [
    crossing === "different"
      ? `${cushionMin} min at the airport, because this one crosses a border.`
      : crossing === "same"
        ? `${cushionMin} min at the airport for a domestic hop.`
        : `${cushionMin} min at the airport — Echo could not tell whether this crosses a border.`,
  ];
  if (ride != null) assumptions.push(`${ride} min to get there, the number you gave.`);

  const where = input.fromIata ? ` at ${airportWords(input.fromIata)}` : "";
  const words =
    ride != null
      ? `Leave by ${clock(leaveAt!)} to be${where} by ${clock(airportBy)} for a ${clock(iso(dep))} departure.`
      : `Be${where} by ${clock(airportBy)} for a ${clock(iso(dep))} departure. Tell Echo how long your ride takes and it will give you a leave-by time.`;

  return { leaveAt, airportBy, cushionMin, rideMinutes: ride, crossing, assumptions, words };
}

/** Minutes a zone is offset from UTC at a given instant, or null when unreadable. */
export function offsetMinutes(tz: string, at: Date = new Date()): number | null {
  try {
    const shown = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).format(at);
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(shown);
    if (!m) return 0; /* GMT with no offset shown is GMT. */
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
  } catch {
    return null;
  }
}

const HAS_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/** The zone an airport keeps, when the kept table carries it. */
export function airportZone(iata: string | null | undefined): string | null {
  return airport(iata)?.tz ?? null;
}

/**
 * A ticket time carries no zone: it is the wall clock at the airport. Anchoring
 * turns it into a real instant so arithmetic on it is honest. Returns the string
 * untouched when it already carries a zone or when the airport's zone is unknown
 * — Echo does not assume a time is UTC just because nobody said.
 */
export function anchorToZone(local: string | null | undefined, tz: string | null | undefined): string | null {
  if (!local) return null;
  if (HAS_ZONE.test(local) || !tz) return local;
  const guess = Date.parse(`${local}Z`);
  if (!Number.isFinite(guess)) return local;
  const first = offsetMinutes(tz, new Date(guess));
  if (first == null) return local;
  let ms = guess - first * 60_000;
  const second = offsetMinutes(tz, new Date(ms));
  if (second != null && second !== first) ms = guess - second * 60_000;
  return new Date(ms).toISOString();
}

export type ClockShift = {
  hours: number;
  minutes: number;
  direction: "ahead" | "behind" | "same";
  words: string;
};

/** What the clock does between two airports. Null when either one is unknown. */
export function clockShift(
  fromIata: string | null | undefined,
  toIata: string | null | undefined,
  at: Date = new Date(),
): ClockShift | null {
  const from = airport(fromIata);
  const to = airport(toIata);
  if (!from || !to) return null;
  const a = offsetMinutes(from.tz, at);
  const b = offsetMinutes(to.tz, at);
  if (a == null || b == null) return null;
  const delta = b - a;
  const direction: ClockShift["direction"] = delta === 0 ? "same" : delta > 0 ? "ahead" : "behind";
  const mins = Math.abs(delta);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = [h ? `${h} hour${h === 1 ? "" : "s"}` : null, m ? `${m} min` : null].filter(Boolean).join(" ");

  const words =
    direction === "same"
      ? `${to.city} keeps the same clock as ${from.city}. Nothing to reset.`
      : `${to.city} runs ${span} ${direction} of ${from.city}. Reset your head, not just your watch.`;
  return { hours: h, minutes: m, direction, words };
}

/** A body-clock line, only where the shift is big enough to be worth saying. */
export function clockShiftNote(shift: ClockShift | null): string | null {
  if (!shift || shift.direction === "same") return null;
  const total = shift.hours * 60 + shift.minutes;
  if (total < 180) return null;
  return shift.direction === "ahead"
    ? "Going forward is the harder direction — daylight on arrival helps more than sleeping it off."
    : "Going back is the easier direction — staying up to local bedtime is usually enough.";
}
