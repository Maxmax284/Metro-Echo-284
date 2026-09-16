// flightQuick — a flight put in by hand, with the least a flight can carry.
//
// Doctrine:
//   - Two things: a flight number and a day. That is the whole ask. Everything
//     else is either read from the flight-data provider, or stays missing.
//   - Missing stays missing. A flight the provider does not know about is kept
//     bare — number and date, no route, no times — never filled in with a guess
//     and never given midnight as a stand-in departure.
//   - One flight, one card. The same number on the same day is the same flight,
//     whoever typed it: the desk, a pasted booking, or something Echo noticed.
//     A second attempt lands you on the card that already exists.
//   - Reads and records. Nothing here buys, holds or checks anyone in.
//
// Pure module: no IO, no React.
import type { FlightOption, FlightPlan } from "./flightPlan.ts";
import type { LiveFlight } from "./flightStatus.ts";

export const QUICK_LAW =
  "A number and a day is enough. Echo fills in the route and the times only if the flight-data provider carries them, and leaves them blank if it does not.";

/* Two letters, or a letter and a digit either way round (U2, 3K), then one to
   four digits. Spaces and a dash between them are how people write it. */
const QUICK_RE = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})$/;

/** A flight number as an airline writes it, or null when that is not one. */
export function readFlightNo(raw: string | null | undefined): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!t) return null;
  const m = t.match(QUICK_RE);
  if (!m) return null;
  /* Leading zeros are the airline's business, not Echo's: TG0601 and TG601 are
     the same flight, and the provider is asked with the short form. */
  const digits = String(Number(m[2]));
  if (digits === "0") return null;
  return `${m[1]}${digits}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a number and a day are enough to file, and the plain reason when not. */
export function quickVerdict(
  flight_no: string | null | undefined,
  depart_on: string | null | undefined,
): { ok: boolean; flight_no?: string; reason?: string } {
  const code = readFlightNo(flight_no);
  if (!code) {
    return { ok: false, reason: "That does not read as a flight number. Two letters and the digits, like TG601." };
  }
  const day = (depart_on ?? "").trim();
  if (!DATE_RE.test(day)) {
    return { ok: false, reason: "A flight needs the day it leaves — Echo will not pick one for you." };
  }
  return { ok: true, flight_no: code };
}

/** The whole flight, as little as it is: a number on a day and nothing invented. */
export function bareOption(flight_no: string, depart_on: string): FlightOption {
  return {
    id: `${flight_no}-${depart_on}`,
    airline: null,
    flight_no,
    depart_at: null,
    arrive_at: null,
    price: null,
    currency: null,
    stops: null,
    note: "added by number, no times on record yet",
  };
}

/** Whether a plan already holds this flight on this day. Dropped plans do not count. */
export function isSameFlight(plan: FlightPlan, flight_no: string, depart_on: string): boolean {
  if (plan.status === "dropped") return false;
  if (String(plan.depart_on ?? "").slice(0, 10) !== depart_on) return false;
  return (plan.options ?? []).some((o) => (o.flight_no ?? "").replace(/\s+/g, "").toUpperCase() === flight_no);
}

/**
 * The card this flight already has, whatever put it there — the desk, a pasted
 * booking, or something Echo noticed. Null when it is genuinely new.
 */
export function findSameFlight(plans: FlightPlan[], flight_no: string, depart_on: string): FlightPlan | null {
  return plans.find((p) => isSameFlight(p, flight_no, depart_on)) ?? null;
}

/** What a bare flight can be told, before a provider has said anything. */
export function bareWords(flight_no: string, depart_on: string): string {
  return `${flight_no} on ${depart_on} — on your record with nothing else on it yet.`;
}

/**
 * A reading from the provider, folded onto the option. Only what the provider
 * actually carried: a missing arrival stays missing, and a flight it knows
 * nothing about leaves the option exactly as bare as it was.
 */
export function fillFromLive(option: FlightOption, live: LiveFlight | null | undefined): FlightOption {
  if (!live) return option;
  const dep = live.departure.scheduled ?? live.departure.estimated ?? null;
  const arr = live.arrival.scheduled ?? live.arrival.estimated ?? null;
  return {
    ...option,
    airline: live.airline ?? option.airline,
    depart_at: dep ?? option.depart_at,
    arrive_at: arr ?? option.arrive_at,
    note: dep ? null : option.note,
  };
}

/** The two ends, as the provider named them. Empty strings where it named none. */
export function routeFromLive(live: LiveFlight | null | undefined): { origin: string; destination: string } {
  return {
    origin: live?.departure.iata ?? "",
    destination: live?.arrival.iata ?? "",
  };
}

/** Whether a reading added anything worth writing back to the plan. */
export function liveAddedSomething(live: LiveFlight | null | undefined): boolean {
  if (!live) return false;
  return !!(live.departure.scheduled || live.departure.estimated || live.departure.iata || live.arrival.iata);
}
