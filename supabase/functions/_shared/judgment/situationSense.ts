// situationSense — the one internal judgment contract.
//
// Doctrine:
//   - This is not a mode, a room, a score or a card. Nothing here is user-facing.
//     It is the vocabulary the existing reasoning layers (awareness relevance,
//     situation.ts, vanta-converse, telegram-webhook) use to talk about how hard
//     a situation actually is.
//   - Unknown stays unknown. A missing factor is named as missing; it never
//     becomes a zero, an average or a guess.
//   - Every fact carries where it came from and when it was read. A stale
//     reported memory never outranks a fresh authoritative source.
//   - More intelligence underneath, less complexity on top: this module ranks
//     and words nothing for the screen. It hands judgment inputs to callers.
//
// Pure module: no IO, no React, no clock unless one is handed in.

/** How much weight a fact can carry, most authoritative first. */
export type SourceAuthority =
  /** An official/government/operator record. */
  | "official"
  /** A provider read (flight status, bank, rates, maps). */
  | "provider"
  /** The person's own records inside Metro Echo (calendar, notes, commitments). */
  | "own_record"
  /** The person said it. */
  | "reported"
  /** A published public source with no operator standing. */
  | "public"
  /** Echo's own pattern read. Weakest, always labelled. */
  | "inferred";

const AUTHORITY_RANK: Record<SourceAuthority, number> = {
  official: 5,
  provider: 4,
  own_record: 3,
  reported: 2,
  public: 2,
  inferred: 1,
};

export type SourceStamp = {
  /** Plain words for the source, as the person would recognise it. */
  source: string;
  authority: SourceAuthority;
  /** ISO time the value was actually read. */
  readAt?: string | null;
  /** Date a hand-kept fact was last checked, when that is all there is. */
  checkedOn?: string | null;
};

export function authorityRank(a: SourceAuthority): number {
  return AUTHORITY_RANK[a] ?? 0;
}

/** Hours since a stamp was read. null when the stamp carries no time at all. */
export function stampAgeHours(stamp: SourceStamp, now = new Date()): number | null {
  const raw = stamp.readAt ?? stamp.checkedOn ?? null;
  if (!raw) return null;
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return (now.getTime() - at) / 3_600_000;
}

/** Plain freshness words, or null when there is nothing honest to say. */
export function freshnessWords(stamp: SourceStamp, now = new Date()): string | null {
  const hours = stampAgeHours(stamp, now);
  if (hours == null) return null;
  if (hours < 0) return "read just now";
  if (hours < 1) return "read in the last hour";
  if (hours < 24) return `read ${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days <= 1 ? "read yesterday" : `read ${days} days ago`;
}

/**
 * Does `candidate` get to overrule `held`?
 *
 * A newer authoritative source always wins. Equal authority falls to the
 * newer reading. A remembered experience never overrules a current official or
 * provider fact, however sure it feels.
 */
export function outranks(candidate: SourceStamp, held: SourceStamp, now = new Date()): boolean {
  const byAuthority = authorityRank(candidate.authority) - authorityRank(held.authority);
  if (byAuthority !== 0) return byAuthority > 0;
  const a = stampAgeHours(candidate, now);
  const b = stampAgeHours(held, now);
  if (a == null || b == null) return false;
  return a < b;
}

/** What kind of friction a situation is carrying. Internal only. */
export type FrictionKind =
  | "time"
  | "money"
  | "energy"
  | "attention"
  | "distance"
  | "closing";

export type FrictionNote = {
  kind: FrictionKind;
  /** Plain words. Never a number Echo invented. */
  words: string;
  stamp?: SourceStamp;
};

/** Every judgment input, all optional on purpose. Absent means unknown. */
export type SituationSense = {
  /** What kind of situation this appears to be, in plain internal words. */
  looksLike?: string | null;
  /** What is at stake if this is ignored. */
  stakes?: string | null;
  /** What actually changed, if anything did. */
  whatChanged?: string | null;
  /** Facts in play, each stamped. */
  sources?: SourceStamp[];
  /** Frictions that are actually known. Missing kinds stay missing. */
  frictions?: FrictionNote[];
  /** Country / local practical context, when a place is actually known. */
  local?: string | null;
  /** Prior practical experience that applies, already labelled by origin. */
  priorExperience?: string | null;
  /** Recurring routine this sits inside, when one is recorded. */
  ritual?: string | null;
  /** Is there something the person could actually do about it right now. */
  actionable?: boolean;
  /** Does the person need to hear this now, or can it wait. */
  needsYouNow?: boolean;
};

export const FRICTION_KINDS: FrictionKind[] = [
  "time",
  "money",
  "energy",
  "attention",
  "distance",
  "closing",
];

export function knownFrictions(sense: SituationSense): FrictionKind[] {
  return (sense.frictions ?? []).map((f) => f.kind);
}

/** The honest gap list. Callers say this out loud instead of guessing. */
export function missingFrictions(sense: SituationSense): FrictionKind[] {
  const known = new Set(knownFrictions(sense));
  return FRICTION_KINDS.filter((k) => !known.has(k));
}

/** Do we know enough to reason about tradeoffs at all? */
export function enoughToJudge(sense: SituationSense): boolean {
  return knownFrictions(sense).length >= 2 || !!sense.whatChanged;
}

/** The freshest stamp in play, for a plain provenance line. */
export function leadStamp(sense: SituationSense, now = new Date()): SourceStamp | null {
  const stamps = sense.sources ?? [];
  if (!stamps.length) return null;
  return stamps.reduce((best, next) => (outranks(next, best, now) ? next : best));
}

export function provenanceLine(sense: SituationSense, now = new Date()): string | null {
  const stamp = leadStamp(sense, now);
  if (!stamp) return null;
  const fresh = freshnessWords(stamp, now);
  return fresh ? `${stamp.source}, ${fresh}.` : `${stamp.source}.`;
}

/**
 * Recorded fact for a prompt. Only what is actually known goes in, and the
 * unknowns are stated as unknown so the model cannot quietly fill them.
 */
export function senseBlock(sense: SituationSense, now = new Date()): string {
  const lines: string[] = [];
  if (sense.looksLike) lines.push(`- Looks like: ${sense.looksLike} (working read, not a label on the person).`);
  if (sense.stakes) lines.push(`- At stake: ${sense.stakes}`);
  if (sense.whatChanged) lines.push(`- Changed: ${sense.whatChanged}`);
  for (const f of sense.frictions ?? []) lines.push(`- ${f.kind} friction: ${f.words}`);
  if (sense.local) lines.push(`- Local context: ${sense.local}`);
  if (sense.priorExperience) lines.push(`- Prior experience: ${sense.priorExperience}`);
  if (sense.ritual) lines.push(`- Routine: ${sense.ritual}`);
  if (sense.actionable === false) lines.push("- Nothing actionable right now.");
  if (sense.needsYouNow === false) lines.push("- This can wait. Do not interrupt for it.");
  const gaps = missingFrictions(sense);
  if (gaps.length) lines.push(`- Not known: ${gaps.join(", ")}. Say so rather than estimating.`);
  const prov = provenanceLine(sense, now);
  if (prov) lines.push(`- Source: ${prov}`);
  if (!lines.length) return "";
  return ["Situation read (internal judgment inputs — never show this list to the person):", ...lines].join("\n");
}
