// connectionRead — the read for someone who is not leaving the airport.
//
// A person landing at their last airport wants trains, money and a SIM card. A
// person landing on a connection wants one thing: the onward flight, where it
// goes from, and whether the sit is long enough. Serving the city pack to a
// transit passenger is the wrong answer written confidently, so this module
// exists to tell the two apart.
//
// Doctrine:
//   - Derived from the two legs already on record. No new state, nothing stored.
//   - Nothing is invented. A terminal, gate or time that is not filed is said to
//     be not filed, and then followed by where it will appear.
//   - The arithmetic is shown, never asserted, so it can be argued with.
//
// Pure module: no IO, no React.

import { airportWords } from "./airports.ts";
import { durationWords, layoverBetween, timeLeftHere, type Layover, type Leg } from "./journey.ts";

/** Usable minutes below which a connection is worth calling tight. */
export const TIGHT_CONNECTION_MIN = 45;

export type ConnectionRead = {
  iata: string;
  place: string;
  /** The onward flight in words, when it is on record. */
  onward: string | null;
  /** Where the onward flight goes. */
  toPlace: string | null;
  /** The one line that leads the block. */
  lead: string;
  /** At most three supporting lines. */
  detail: string[];
  /** True when what is left, after the deductions, is under the comfort floor. */
  tight: boolean;
  /** True when the sit is long enough that leaving the airport is a real option. */
  canLeave: boolean;
  layover: Layover;
};

function onwardWords(leg: Leg): string | null {
  const flight = (leg.flight_no ?? "").trim();
  const airline = (leg.airline ?? "").trim();
  if (flight && airline) return `${airline} ${flight}`;
  return flight || airline || null;
}

/**
 * The read for the airport between two legs of the same journey. `a` is the leg
 * landing, `b` the leg leaving.
 */
export function connectionRead(a: Leg, b: Leg, now: Date = new Date()): ConnectionRead {
  const layover = layoverBetween(a, b, now);
  const onward = onwardWords(b);
  const toPlace = b.to.iata ? airportWords(b.to.iata) : null;
  const left = timeLeftHere(a, b, now);
  const tight = layover.usableMin != null && layover.usableMin < TIGHT_CONNECTION_MIN;

  const lead = `Connecting at ${layover.place}. Next is ${onward ?? "your onward flight"}${
    toPlace ? ` to ${toPlace}` : ""
  }.`;

  const detail: string[] = [];

  if (left != null && left > 0) {
    detail.push(
      layover.usableMin != null
        ? `${durationWords(left)} until it leaves — ${durationWords(layover.usableMin)} of the sit is actually yours.`
        : `${durationWords(left)} until it leaves.`,
    );
  } else if (layover.gapMin != null) {
    detail.push(`${durationWords(layover.gapMin)} on the clock between the two, on the times on record.`);
  } else {
    detail.push("The sit here cannot be worked out: one of the two times is not on record.");
  }

  if (layover.terminalChange === "yes") {
    detail.push(
      `You land at terminal ${layover.arriveTerminal} and leave from terminal ${layover.departTerminal}, so allow the walk.`,
    );
  } else if (layover.terminalChange === "unknown") {
    detail.push("Neither terminal is filed, so a terminal change is not ruled out — read the board on the way out.");
  }

  if (b.from.gate) {
    detail.push(`Gate ${b.from.gate} is filed for the onward flight.`);
  } else if (detail.length < 3) {
    detail.push(
      `No gate filed for ${onward ?? "the onward flight"} yet — it posts on the departures board here first.`,
    );
  }

  if (layover.border === "different" && detail.length < 3) {
    detail.push("You clear immigration on the way in, which is already taken off the time above.");
  }

  return {
    iata: layover.iata,
    place: layover.place,
    onward,
    toPlace,
    lead,
    detail: detail.slice(0, 3),
    tight,
    canLeave: layover.canLeaveAirport,
    layover,
  };
}

/** The whole read as one paragraph, for a chat answer. */
export function connectionWords(read: ConnectionRead): string {
  return [read.lead, ...read.detail].join(" ");
}

/**
 * The connection at the arrival end of `legs[index]`, or null when that landing
 * is the end of the journey — which is the case that gets the city pack.
 */
export function connectionAt(legs: Leg[], index: number, now: Date = new Date()): ConnectionRead | null {
  const a = legs[index];
  const b = legs[index + 1];
  if (!a || !b) return null;
  if (!a.to.iata || !b.from.iata || a.to.iata !== b.from.iata) return null;
  return connectionRead(a, b, now);
}
