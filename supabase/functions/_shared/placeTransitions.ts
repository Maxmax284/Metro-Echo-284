// placeTransitions — the ledger of moves that actually mattered.
//
// Doctrine:
//   - Meaningful transitions only. Virginia to DC, an airport arrival, Virginia
//     to Tokyo, Tokyo to Thailand, coming home. Never a breadcrumb trail, never
//     a step count, never a line on a map of somebody's day.
//   - A transition is only recorded when a named level actually changed and the
//     new read is not thin. A conflicted read records nothing.
//   - Every row carries what said so and when. No provenance, no row.
//
// Pure module: no IO. The caller writes the row.

import {
  type PlaceLevel,
  type PlaceState,
  levelRank,
  placeWords,
  PLACE_LEVELS,
} from "./placeState.ts";

export type TransitionKind =
  | "country_change"
  | "region_change"
  | "metro_change"
  | "airport_arrival"
  | "returned_home";

export type PlaceTransition = {
  kind: TransitionKind;
  level: PlaceLevel;
  fromWords: string | null;
  toWords: string | null;
  /** Evidence kinds that supported the new read. */
  evidence: string[];
  confidence: PlaceState["confidence"];
  atIso: string;
};

/** Levels worth a row. Locality and exact churn all day and are not news. */
const NEWSWORTHY: PlaceLevel[] = ["country", "region", "metro"];

function levelValue(state: PlaceState, level: PlaceLevel): string | null {
  const raw =
    level === "country" ? state.where.country
    : level === "region" ? state.where.region
    : level === "metro" ? state.where.metro
    : level === "locality" ? state.where.locality
    : state.where.exact;
  const t = (raw ?? "").trim();
  return t ? t : null;
}

const KIND_FOR: Record<string, TransitionKind> = {
  country: "country_change",
  region: "region_change",
  metro: "metro_change",
};

/**
 * The one transition worth recording between two reads, or null when nothing
 * newsworthy happened. Coarsest change wins: a country change is the story, not
 * the three finer changes that came with it.
 */
export function transitionBetween(
  before: PlaceState | null,
  after: PlaceState,
  atIso: string,
): PlaceTransition | null {
  if (after.conflicts.length) return null;
  if (after.confidence === "thin") return null;

  for (const level of NEWSWORTHY) {
    if (levelRank(after.level) < levelRank(level)) continue;
    const next = levelValue(after, level);
    if (!next) continue;
    const prev = before ? levelValue(before, level) : null;
    if (prev && prev.trim().toLowerCase() === next.trim().toLowerCase()) continue;
    if (!prev && before) continue; // nothing was known before; that is not a move

    return {
      kind: KIND_FOR[level],
      level,
      fromWords: before ? placeWords(before) : null,
      toWords: placeWords(after),
      evidence: [...new Set(after.used.map((u) => u.kind))],
      confidence: after.confidence,
      atIso,
    };
  }
  return null;
}

/** An airport arrival is its own kind of news even inside the same metro. */
export function airportArrival(
  after: PlaceState,
  airportName: string,
  atIso: string,
): PlaceTransition {
  return {
    kind: "airport_arrival",
    level: "locality",
    fromWords: null,
    toWords: airportName,
    evidence: [...new Set(after.used.map((u) => u.kind))],
    confidence: after.confidence,
    atIso,
  };
}

export function returnedHome(after: PlaceState, atIso: string): PlaceTransition {
  return {
    kind: "returned_home",
    level: after.level,
    fromWords: null,
    toWords: placeWords(after),
    evidence: [...new Set(after.used.map((u) => u.kind))],
    confidence: after.confidence,
    atIso,
  };
}

const KIND_WORDS: Record<TransitionKind, string> = {
  country_change: "changed country",
  region_change: "changed state or region",
  metro_change: "moved to another area",
  airport_arrival: "arrived at an airport",
  returned_home: "came home",
};

export function transitionWords(t: PlaceTransition): string {
  const move = t.fromWords && t.toWords ? `${t.fromWords} → ${t.toWords}` : (t.toWords ?? "somewhere new");
  return `${KIND_WORDS[t.kind]}: ${move}`;
}

/**
 * Guard against a trail. Echo keeps transitions, not tracks: anything finer
 * than a metro move, or a repeat of the level already recorded, is dropped.
 */
export function keepsNoTrail(rows: PlaceTransition[]): boolean {
  return rows.every((r) => PLACE_LEVELS.indexOf(r.level) <= PLACE_LEVELS.indexOf("locality"));
}
