// landedAlert — the one note that says the wheels are on the ground.
//
// Doctrine:
//   - It speaks once per touchdown, from the airline's own record: the actual
//     arrival time the feed stamped, never a guess off the schedule.
//   - The time is said the way the airport says it: wall clock where the plane
//     landed, anchored by that airport's timezone, never the device's.
//   - Gate and terminal are the airline's word, or an honest "not filed".
//   - Old news is not news. A landing more than a few hours old stays quiet,
//     so filing a flight that already landed never fakes a fresh alert.
//   - Nothing here executes. It tells you where you are; the next move is yours.
//
// Pure module: no IO, no React. The sweep reads it; the tests pin its words.

import { airport, airportWords } from "./airports.ts";
import { flightPhase, type LiveFlight } from "./flightStatus.ts";
import { minutesToDeparture, plainTimeWords } from "./preDeparture.ts";
import { TERMINAL_CAVEAT } from "./journey.ts";

/** A landing older than this is history, not news. */
export const LANDED_NEWS_WINDOW_MIN = 6 * 60;
/** With no timezone to anchor on, a just-taken reading is the only honest proxy. */
export const LANDED_FRESH_READING_MS = 45 * 60_000;

export type LandedAlert = {
  /** One per plan per recorded touchdown: `flight_landed:<plan>:<day>`. */
  dedupeKey: string;
  /** The conclusion, first. */
  title: string;
  /** Time, gate and terminal, ending on the caveat every flight note carries. */
  detail: string;
};

export function landedAlert(input: {
  planId: string;
  flightNo?: string | null;
  destinationIata?: string | null;
  live: LiveFlight | null | undefined;
  /** When the reading behind `live` was taken — the recency fallback. */
  checkedAt?: string | null;
  now?: Date;
}): LandedAlert | null {
  const live = input.live ?? null;
  const now = input.now ?? new Date();
  if (!live || flightPhase(live, now) !== "landed") return null;
  const actual = live.arrival?.actual ?? null;
  if (!actual) return null;

  const iata = (input.destinationIata ?? "").trim().toUpperCase() || live.arrival?.iata || null;

  /* Recency, anchored at the arrival airport's own clock. minutesToDeparture
     counts minutes until a wall-clock time, so a touchdown in the past reads
     negative. When the airport's timezone is unknown, only a fresh reading may
     pass — anything else risks announcing an old landing as new. */
  const until = minutesToDeparture(actual, iata, now);
  if (until != null) {
    const since = -until;
    if (since < 0 || since > LANDED_NEWS_WINDOW_MIN) return null;
  } else {
    const stamp = input.checkedAt ? Date.parse(input.checkedAt) : NaN;
    if (!Number.isFinite(stamp) || now.getTime() - stamp > LANDED_FRESH_READING_MS) return null;
  }

  const flight = (input.flightNo ?? live.flight_no ?? "").trim();
  const place = airportWords(iata);
  const day = actual.slice(0, 10);
  const tz = airport(iata)?.tz ?? "UTC";
  const when = plainTimeWords(actual, tz, now);

  const delay = live.arrival?.delay_min ?? null;
  const delayWords = delay != null && Math.abs(delay) >= 5
    ? delay > 0
      ? `, ${delay} minutes behind the filed time`
      : `, ${Math.abs(delay)} minutes ahead of it`
    : "";

  const gate = live.arrival?.gate ?? null;
  const terminal = live.arrival?.terminal ?? null;
  const stand = gate
    ? `Arrival gate ${gate}${terminal ? `, terminal ${terminal}` : ""} — the airline's word.`
    : terminal
      ? `Terminal ${terminal} filed, no arrival gate yet.`
      : "No arrival gate or terminal on the record yet — the boards inside will have it first.";

  const title = `${flight ? `${flight} touched down` : "Your flight touched down"} at ${place}.`;
  const city = airport(iata)?.city ?? null;
  const detail = [
    `Wheels down ${when}${city ? `, ${city} time` : ""}${delayWords}.`,
    stand,
    TERMINAL_CAVEAT,
  ].join("\n");

  return { dedupeKey: `flight_landed:${input.planId}:${day}`, title, detail };
}
