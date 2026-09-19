// groundPath — the practical next move, derived from what is already on record.
//
// The itinerary answers "when". This answers "where do I physically go next",
// which is the only question that matters standing in a departures hall.
//
// Doctrine:
//   - Derived, never stored. No new state machine, no phase written anywhere.
//   - One lead line. Everything else is at most two supporting lines, so the
//     card gets shorter as the journey gets clearer, not longer.
//   - It sends you to the operating carrier, because that is what is printed in
//     the terminal.
//   - A gate that is not filed is said plainly and then followed by a next step.
//     "Gate not filed yet" is never the last thing Echo says.
//   - Nothing here checks in, drops a bag, or holds a seat.
//
// Pure module: no IO, no React.

import { boardWords, checkInCarrier, checkInWords, type FlightIdentity } from "./flightIdentity.ts";

export const GROUND_LAW =
  "Echo tells you where to stand next from what is on record. It never checks you in, drops a bag, or holds a seat.";

export type GroundStep =
  | "before_airport"
  | "find_check_in"
  | "through_security"
  | "gate_pending"
  | "gate_posted"
  | "boarding"
  | "in_air"
  | "between_legs"
  | "landed"
  | "none";

export type GroundRead = {
  step: GroundStep;
  /** The one line that leads the card. */
  lead: string;
  /** At most two supporting lines. */
  detail: string[];
  /** True when a check-in area could be looked up and is not on record. */
  needsCheckIn: boolean;
};

/** Minutes before departure at which a person should already be at the gate. */
export const AT_GATE_MIN = 40;
/** Minutes before departure at which counters are the thing that matters. */
export const CHECK_IN_WINDOW_MIN = 4 * 60;

export type GroundInput = {
  /** Where the journey model says you are. */
  where: "before" | "at_airport" | "in_air" | "on_ground" | "done" | "stopped";
  /** Both flight identities for the leg ahead, when on record. */
  identity: FlightIdentity | null;
  /** Airport you are standing in or leaving from, in words. */
  fromPlace: string | null;
  /** Where the leg ahead lands, in words. */
  toPlace: string | null;
  terminal: string | null;
  gate: string | null;
  /** Minutes until the leg ahead departs. Negative means it has gone. */
  minsToDeparture: number | null;
  /** True once the person said they are through security. */
  throughSecurity?: boolean;
};

function trimmed(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function terminalWords(terminal: string | null): string | null {
  const t = trimmed(terminal);
  return t ? `Terminal ${t.replace(/^T(?=\w)/i, "")}` : null;
}

/** What to do next, and nothing more than that. */
export function groundPath(input: GroundInput): GroundRead {
  const board = boardWords(input.identity, input.toPlace);
  const carrier = checkInCarrier(input.identity);
  const zone = checkInWords(input.identity);
  const term = terminalWords(input.terminal);
  const gate = trimmed(input.gate);
  const place = trimmed(input.fromPlace);

  if (input.where === "stopped") {
    return {
      step: "none",
      lead: "This leg is on hold until you say what happened, so Echo is not sending you anywhere.",
      detail: [],
      needsCheckIn: false,
    };
  }

  if (input.where === "done") {
    return {
      step: "landed",
      lead: `Down at ${trimmed(input.toPlace) ?? "your destination"}. Immigration, then bags, then the way out.`,
      detail: [],
      needsCheckIn: false,
    };
  }

  if (input.where === "in_air") {
    return {
      step: "in_air",
      lead: `In the air to ${trimmed(input.toPlace) ?? "your destination"}.`,
      detail: gate ? [`Arrival gate ${gate}.`] : [],
      needsCheckIn: false,
    };
  }

  if (input.where === "before") {
    const detail: string[] = [];
    if (board) detail.push(board);
    if (term) detail.push(`${term} at ${place ?? "the airport"}, as filed.`);
    return {
      step: "before_airport",
      lead: `Not at the airport yet. Getting to ${place ?? "the airport"} is the move.`,
      detail: detail.slice(0, 2),
      needsCheckIn: false,
    };
  }

  /* On the airport floor. What matters now depends only on how close the
     departure is and on which facts exist — never on a guess. */
  const mins = input.minsToDeparture;
  const boarding = mins != null && mins <= AT_GATE_MIN;
  const between = input.where === "on_ground";

  if (gate) {
    const detail: string[] = [];
    if (term) detail.push(`${term}.`);
    if (board) detail.push(board);
    return {
      step: boarding ? "boarding" : "gate_posted",
      lead: boarding ? `Gate ${gate}. Boarding is the next thing.` : `Gate ${gate} is posted. Head that way.`,
      detail: detail.slice(0, 2),
      needsCheckIn: false,
    };
  }

  if (input.throughSecurity || between) {
    const detail: string[] = [];
    if (term) detail.push(`${term}, as filed.`);
    if (board) detail.push(board);
    return {
      step: "gate_pending",
      lead: `No gate filed yet. Watch the departures board for ${
        carrier ?? "your flight"
      } — it posts there before anywhere else.`,
      detail: detail.slice(0, 2),
      needsCheckIn: false,
    };
  }

  /* Before security, the counter is the whole job, and the counter belongs to
     the airline that flies the aircraft. */
  const detail: string[] = [];
  if (zone) detail.push(zone);
  if (term) detail.push(`${term}, as filed.`);
  if (!zone && board) detail.push(board);
  const lead = zone
    ? `Check in with ${carrier ?? "the operating airline"} first, then bags, then security.`
    : `Find ${carrier ?? "the operating airline"}'s check-in desks${
        place ? ` at ${place}` : ""
      } — the zone is not on record, so Echo will not name one.`;
  return {
    step: "find_check_in",
    lead,
    detail: detail.slice(0, 2),
    needsCheckIn: !zone,
  };
}

/** The whole read as one paragraph, for a chat answer. */
export function groundWords(read: GroundRead): string {
  return [read.lead, ...read.detail].join(" ");
}
