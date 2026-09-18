// flightReconcile — new evidence meets a flight already on record.
//
// Doctrine:
//   - A screenshot is evidence, not authority. It may fill a blank on a flight
//     you already have. It may never quietly rewrite a fact that is already
//     filled in — that becomes one question instead.
//   - New facts modify the situation that exists before creating another one.
//     Same flight number, same day, same flight.
//   - Silence is a valid outcome: evidence that agrees with the record changes
//     nothing and says so.
//   - Operational truth is not in here. Status, operating carrier, gate,
//     terminal, delay and cancellation come only from a provider reading. This
//     module refuses to touch them.
//
// Pure module: no IO, no React.

import type { RecognizedLeg } from "./flightRecognize.ts";

/** The parts of a filed flight this module is allowed to look at. */
export type FiledFlight = {
  id: string;
  origin: string | null;
  destination: string | null;
  depart_on: string;
  booking_ref: string | null;
  traveller_name: string | null;
  options: Array<{
    id?: string | null;
    airline?: string | null;
    flight_no?: string | null;
    depart_at?: string | null;
    arrive_at?: string | null;
    [k: string]: unknown;
  }>;
};

export type FactKey =
  | "origin"
  | "destination"
  | "depart_time"
  | "arrive_time"
  | "booking_ref"
  | "traveller";

/** Facts a provider owns. Evidence never sets these, whatever it says. */
export const PROVIDER_ONLY_FACTS = [
  "status",
  "operating_carrier",
  "gate",
  "terminal",
  "delay",
  "cancellation",
] as const;

export type Fill = { key: FactKey; value: string; words: string };
export type Conflict = { key: FactKey; filed: string; seen: string; words: string };

export type Reconciliation = {
  /** Blanks the evidence filled. Safe: nothing was overwritten. */
  fills: Fill[];
  /** Facts the evidence repeated back. A second source, no change. */
  confirms: FactKey[];
  /** Facts the evidence disagrees with. Nothing is written for these. */
  conflicts: Conflict[];
};

const FACT_WORDS: Record<FactKey, string> = {
  origin: "where it leaves from",
  destination: "where it lands",
  depart_time: "the departure time",
  arrive_time: "the arrival time",
  booking_ref: "the confirmation code",
  traveller: "who is travelling",
};

/** HH:mm out of a stored option time, or null. */
export function clockOf(iso: string | null | undefined): string | null {
  const m = String(iso ?? "").match(/T([01]\d|2[0-3]):([0-5]\d)/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function same(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Is this evidence about the flight on record at all? Number and day, both. */
export function isSameFiledFlight(filed: FiledFlight, leg: RecognizedLeg): boolean {
  if (!leg.depart_on || filed.depart_on !== leg.depart_on) return false;
  return filed.options.some((o) => same(String(o?.flight_no ?? ""), leg.flight_no));
}

/**
 * Sort every fact the evidence carries into filled-a-blank, confirmed, or
 * disagreed. Nothing here writes; the caller decides what to do with each pile.
 */
export function reconcileFlight(
  filed: FiledFlight,
  leg: RecognizedLeg,
  extra: { booking_ref?: string | null; traveller?: string | null } = {},
): Reconciliation {
  const out: Reconciliation = { fills: [], confirms: [], conflicts: [] };
  const option = filed.options.find((o) => same(String(o?.flight_no ?? ""), leg.flight_no)) ?? filed.options[0] ?? {};

  const pairs: Array<{ key: FactKey; filed: string | null; seen: string | null }> = [
    { key: "origin", filed: filed.origin || null, seen: leg.origin },
    { key: "destination", filed: filed.destination || null, seen: leg.destination },
    { key: "depart_time", filed: clockOf(option.depart_at as string | null), seen: leg.depart_time },
    { key: "arrive_time", filed: clockOf(option.arrive_at as string | null), seen: leg.arrive_time },
    { key: "booking_ref", filed: filed.booking_ref, seen: extra.booking_ref ?? null },
    { key: "traveller", filed: filed.traveller_name, seen: extra.traveller ?? null },
  ];

  for (const p of pairs) {
    if (!p.seen) continue;
    if (!p.filed) {
      out.fills.push({
        key: p.key,
        value: p.seen,
        words: `filled in ${FACT_WORDS[p.key]} — ${p.seen}`,
      });
      continue;
    }
    if (same(p.filed, p.seen)) {
      out.confirms.push(p.key);
      continue;
    }
    out.conflicts.push({
      key: p.key,
      filed: p.filed,
      seen: p.seen,
      words: `${FACT_WORDS[p.key]} does not match: you have ${p.filed}, this says ${p.seen}`,
    });
  }
  return out;
}

/**
 * The database patch for the safe fills only. Returns null when there is
 * nothing to write, so a caller never issues an empty update.
 */
export function fillPatch(
  filed: FiledFlight,
  fills: Fill[],
  seen: { arrive_on?: string | null } = {},
): Record<string, unknown> | null {
  if (fills.length === 0) return null;
  const patch: Record<string, unknown> = {};
  const byKey = new Map(fills.map((f) => [f.key, f.value]));
  if (byKey.has("origin")) patch.origin = byKey.get("origin");
  if (byKey.has("destination")) patch.destination = byKey.get("destination");
  if (byKey.has("booking_ref")) patch.booking_ref = byKey.get("booking_ref");
  if (byKey.has("traveller")) patch.traveller_name = byKey.get("traveller");

  const depart = byKey.get("depart_time");
  const arrive = byKey.get("arrive_time");
  if (depart || arrive) {
    /* A time is written onto the option it belongs to, on the day that is
       already on record. No day is invented here. */
    patch.options = filed.options.map((o) => {
      const next = { ...o };
      if (depart && !next.depart_at) next.depart_at = `${filed.depart_on}T${depart}:00`;
      if (arrive && !next.arrive_at) next.arrive_at = `${filed.depart_on}T${arrive}:00`;
      return next;
    });
  }
  return Object.keys(patch).length ? patch : null;
}

/** What Echo says back, in the order a person cares about. */
export function reconcileWords(r: Reconciliation): string[] {
  const lines: string[] = [];
  if (r.fills.length) {
    lines.push(`That filled in what was missing: ${r.fills.map((f) => f.words.replace(/^filled in /, "")).join("; ")}.`);
  }
  if (r.confirms.length && !r.fills.length && !r.conflicts.length) {
    lines.push("Everything on it matches what you already have. Nothing changed.");
  } else if (r.confirms.length) {
    lines.push(`The rest matches what you already had.`);
  }
  for (const c of r.conflicts) {
    lines.push(`One thing doesn't line up — ${c.words}. I left your record alone; say which is right.`);
  }
  return lines;
}

/** True when a person has to answer before anything else happens. */
export function needsAnswer(r: Reconciliation): boolean {
  return r.conflicts.length > 0;
}
