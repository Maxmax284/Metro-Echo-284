// placeState — one role-aware read of where a person actually is.
//
// Doctrine:
//   - This is not a map room and not a location history. It is one current
//     answer plus the evidence behind it.
//   - Roles matter more than coordinates. Home, a temporary base, where you are
//     standing, where you just were, a transit place and where you are heading
//     are six different things and Echo must not mash them.
//   - Evidence is fused, never trusted singly. The strongest fresh source names
//     the place; a weaker source only fills a level nobody stronger has spoken
//     about.
//   - Disagreement is returned as disagreement. If the itinerary says Tokyo and
//     the device says Seoul, Echo says both and picks neither.
//   - Precision is never inflated. A country-level signal may never name a
//     street, and names never travel with coordinates.
//
// Pure module: no IO, no React, no hidden clock.

import { type SourceStamp, authorityRank, stampAgeHours } from "./judgment/situationSense.ts";

export type PlaceRole =
  | "home"
  | "temporary_base"
  | "current"
  | "recent"
  | "transit"
  | "destination";

export const PLACE_ROLE_WORDS: Record<PlaceRole, string> = {
  home: "home",
  temporary_base: "where you're based for now",
  current: "where you are",
  recent: "where you just were",
  transit: "in transit",
  destination: "where you're heading",
};

/** Coarse to fine. Echo may only speak at the level its evidence supports. */
export const PLACE_LEVELS = ["country", "region", "metro", "locality", "exact"] as const;
export type PlaceLevel = (typeof PLACE_LEVELS)[number];

export function levelRank(level: PlaceLevel): number {
  return PLACE_LEVELS.indexOf(level);
}

export type PlaceHierarchy = {
  /** Two-letter country code, uppercase, when known. */
  country?: string | null;
  /** State, province or equivalent. */
  region?: string | null;
  metro?: string | null;
  locality?: string | null;
  /** A named exact place, only when deliberately available. */
  exact?: string | null;
};

/** Where a place signal came from. Each is a different kind of promise. */
export type PlaceEvidenceKind =
  | "stated"
  | "device_fix"
  | "device_timezone"
  | "journey"
  | "calendar_event"
  | "nearby_request"
  | "network_geography";

export const EVIDENCE_WORDS: Record<PlaceEvidenceKind, string> = {
  stated: "you told Echo",
  device_fix: "a location fix you allowed",
  device_timezone: "your device clock",
  journey: "a filed journey",
  calendar_event: "a calendar entry",
  nearby_request: "a nearby lookup you ran",
  network_geography: "coarse network geography",
};

/** The finest level each kind of evidence is ever allowed to claim. */
const KIND_CEILING: Record<PlaceEvidenceKind, PlaceLevel> = {
  stated: "exact",
  device_fix: "exact",
  device_timezone: "country",
  journey: "locality",
  calendar_event: "exact",
  nearby_request: "locality",
  network_geography: "region",
};

export type PlaceEvidence = {
  kind: PlaceEvidenceKind;
  role: PlaceRole;
  where: PlaceHierarchy;
  /** The finest level this particular signal actually supports. */
  level: PlaceLevel;
  stamp: SourceStamp;
};

export type PlaceConflict = {
  level: PlaceLevel;
  /** The competing values, plain words, strongest first. */
  values: Array<{
    /** The contested value at this level, e.g. "JP". */
    value: string;
    /** How that source names the place in full, e.g. "Tokyo, JP". */
    words: string;
    from: PlaceEvidenceKind;
    stamp: SourceStamp;
  }>;
};

export type PlaceState = {
  role: PlaceRole;
  where: PlaceHierarchy;
  /** Finest level Echo is allowed to speak at. */
  level: PlaceLevel;
  /** How sure, in words, never a fake percentage. */
  confidence: "firm" | "likely" | "thin";
  stamp: SourceStamp | null;
  /** Every level where sources disagree. Never resolved silently. */
  conflicts: PlaceConflict[];
  /** Evidence that fed this read, strongest first. */
  used: PlaceEvidence[];
};

/** A fix nobody has refreshed in a day is old news, not current truth. */
const STALE_HOURS = 24;

function capped(evidence: PlaceEvidence): PlaceLevel {
  const ceiling = KIND_CEILING[evidence.kind];
  return levelRank(evidence.level) > levelRank(ceiling) ? ceiling : evidence.level;
}

function valueAt(where: PlaceHierarchy, level: PlaceLevel): string | null {
  const raw =
    level === "country" ? where.country
    : level === "region" ? where.region
    : level === "metro" ? where.metro
    : level === "locality" ? where.locality
    : where.exact;
  const t = (raw ?? "").trim();
  return t ? t : null;
}

function strength(evidence: PlaceEvidence, now: Date): number {
  const age = stampAgeHours(evidence.stamp, now);
  const fresh = age == null ? 0 : age <= 1 ? 3 : age <= 6 ? 2 : age <= STALE_HOURS ? 1 : 0;
  return authorityRank(evidence.stamp.authority) * 10 + fresh;
}

/**
 * Fuse evidence into one role-aware read. Only evidence for the asked role is
 * used: a calendar destination never becomes "where you are".
 */
export function fusePlace(
  role: PlaceRole,
  evidence: PlaceEvidence[],
  now = new Date(),
): PlaceState {
  const mine = evidence
    .filter((e) => e.role === role)
    .map((e) => ({ ...e, level: capped(e) }))
    .sort((a, b) => strength(b, now) - strength(a, now));

  if (!mine.length) {
    return { role, where: {}, level: "country", confidence: "thin", stamp: null, conflicts: [], used: [] };
  }

  const where: PlaceHierarchy = {};
  const conflicts: PlaceConflict[] = [];

  for (const level of PLACE_LEVELS) {
    const speakers = mine.filter((e) => levelRank(e.level) >= levelRank(level) && valueAt(e.where, level));
    if (!speakers.length) continue;

    const winner = speakers[0];
    const winning = valueAt(winner.where, level)!;
    const norm = (s: string) => s.trim().toLowerCase();
    const differing = speakers.filter((e) => norm(valueAt(e.where, level)!) !== norm(winning));

    if (differing.length) {
      conflicts.push({
        level,
        values: speakers.map((e) => ({ value: valueAt(e.where, level)!, from: e.kind, stamp: e.stamp })),
      });
      // A contested level is spoken about by nobody. Coarser levels still hold.
      break;
    }

    if (level === "country") where.country = winning.toUpperCase();
    else if (level === "region") where.region = winning;
    else if (level === "metro") where.metro = winning;
    else if (level === "locality") where.locality = winning;
    else where.exact = winning;
  }

  const spoken = PLACE_LEVELS.filter((l) => valueAt(where, l));
  const level: PlaceLevel = spoken.length ? spoken[spoken.length - 1] : "country";

  const best = mine[0];
  const age = stampAgeHours(best.stamp, now);
  const stale = age != null && age > STALE_HOURS;
  const confidence: PlaceState["confidence"] =
    conflicts.length || stale ? "thin"
    : authorityRank(best.stamp.authority) >= 3 && spoken.length >= 2 ? "firm"
    : "likely";

  return { role, where, level, confidence, stamp: best.stamp, conflicts, used: mine };
}

/** The place in plain words, at exactly the precision the evidence supports. */
export function placeWords(state: PlaceState): string | null {
  const parts = [state.where.exact, state.where.locality, state.where.metro, state.where.region, state.where.country]
    .filter((p): p is string => !!p && !!p.trim());
  if (!parts.length) return null;
  // Say the two most specific known levels: "Arlington, VA" reads like a person.
  return parts.slice(0, 2).join(", ");
}

/** What Echo says when sources disagree. It never picks for the person. */
export function conflictWords(state: PlaceState): string | null {
  if (!state.conflicts.length) return null;
  const c = state.conflicts[0];
  const said = c.values
    .map((v) => `${v.value} (${EVIDENCE_WORDS[v.from]})`)
    .join(" and ");
  return `Two sources disagree about where you are: ${said}. Echo is not going to pick one — say which is right.`;
}

/** One honest line for a prompt or a strip. Empty when there is nothing to say. */
export function placeStateLine(state: PlaceState): string {
  const words = placeWords(state);
  if (!words) return "";
  const clash = conflictWords(state);
  const base = `${PLACE_ROLE_WORDS[state.role]}: ${words}`;
  const sure = state.confidence === "thin" ? " — thin evidence" : "";
  return clash ? `${base}${sure}. ${clash}` : `${base}${sure}.`;
}
