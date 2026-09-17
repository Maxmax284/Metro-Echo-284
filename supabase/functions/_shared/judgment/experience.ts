// experience — "what bit me before?", grounded and expiring.
//
// Doctrine:
//   - Practical experience only: this place wants cash, that office wanted paper
//     copies, that cheap route was painful. Never personality, never a score,
//     never a hidden profile.
//   - Origin is always visible: the person said it, a source published it, or
//     Echo spotted a pattern. An inferred pattern is labelled as inferred and is
//     the weakest thing in the room.
//   - A memory may inform a suggestion. It may never overrule a newer
//     authoritative source. Current beats remembered, always.
//   - Everything has a recorded date and a shelf life.
//
// Pure module.

import { type SourceStamp, authorityRank, freshnessWords, outranks } from "./situationSense.ts";

export type ExperienceOrigin =
  /** The person told Echo. */
  | "user_reported"
  /** A published or official current fact. */
  | "external_fact"
  /** Echo noticed a repeat. Always labelled, never silent. */
  | "inferred_pattern";

export type ExperienceEntry = {
  id: string;
  /** What the practical lesson is, in the person's own terms. */
  lesson: string;
  origin: ExperienceOrigin;
  /** ISO time it was recorded. */
  recordedAt: string;
  /** Where it applies: a place, a country, a route, an office, a service. */
  scope?: string | null;
  /** Days after which it stops being trusted on its own. */
  staleAfterDays?: number | null;
  stamp?: SourceStamp;
};

const DAY = 24 * 60 * 60 * 1000;

/** Default shelf life by origin. A guess expires soonest. */
const DEFAULT_STALE_DAYS: Record<ExperienceOrigin, number> = {
  user_reported: 365,
  external_fact: 180,
  inferred_pattern: 90,
};

export const ORIGIN_WORDS: Record<ExperienceOrigin, string> = {
  user_reported: "you told me",
  external_fact: "published",
  inferred_pattern: "a pattern I spotted",
};

export function experienceStaleAt(entry: ExperienceEntry): number | null {
  const at = Date.parse(entry.recordedAt);
  if (!Number.isFinite(at)) return null;
  const days = entry.staleAfterDays ?? DEFAULT_STALE_DAYS[entry.origin];
  return at + days * DAY;
}

export function isFresh(entry: ExperienceEntry, now = new Date()): boolean {
  const stale = experienceStaleAt(entry);
  return stale == null ? false : stale > now.getTime();
}

/**
 * What applies here, freshest and best-grounded first. Stale entries are
 * dropped rather than quietly aged into fact.
 */
export function applicableExperience(
  entries: ExperienceEntry[],
  opts: { scope?: string | null; now?: Date; limit?: number } = {},
): ExperienceEntry[] {
  const now = opts.now ?? new Date();
  const scope = (opts.scope ?? "").trim().toLowerCase();
  return entries
    .filter((e) => isFresh(e, now))
    .filter((e) => {
      if (!scope) return true;
      const own = (e.scope ?? "").trim().toLowerCase();
      return !own || own === scope || scope.includes(own) || own.includes(scope);
    })
    .sort((a, b) => {
      const byOrigin = originWeight(b.origin) - originWeight(a.origin);
      if (byOrigin !== 0) return byOrigin;
      return Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
    })
    .slice(0, opts.limit ?? 3);
}

function originWeight(origin: ExperienceOrigin): number {
  return origin === "external_fact" ? 3 : origin === "user_reported" ? 2 : 1;
}

/**
 * The rule that keeps this honest: a remembered lesson yields to a newer
 * authoritative source. Returns true when the memory must step aside.
 */
export function yieldsToCurrent(
  entry: ExperienceEntry,
  current: SourceStamp | null | undefined,
  now = new Date(),
): boolean {
  if (!current) return false;
  const held: SourceStamp = entry.stamp ?? {
    source: ORIGIN_WORDS[entry.origin],
    authority: entry.origin === "external_fact" ? "public" : entry.origin === "user_reported" ? "reported" : "inferred",
    readAt: entry.recordedAt,
  };
  if (authorityRank(current.authority) > authorityRank(held.authority)) return true;
  return outranks(current, held, now);
}

/** One labelled line. The origin is never hidden. */
export function experienceLine(entry: ExperienceEntry, now = new Date()): string {
  const fresh = freshnessWords({ source: ORIGIN_WORDS[entry.origin], authority: "reported", readAt: entry.recordedAt }, now);
  const when = fresh ? `, ${fresh}` : "";
  const where = entry.scope ? ` (${entry.scope})` : "";
  return `${entry.lesson}${where} — ${ORIGIN_WORDS[entry.origin]}${when}.`;
}

export function experienceBlock(entries: ExperienceEntry[], now = new Date()): string {
  if (!entries.length) return "";
  return [
    "What has bitten before (recorded, labelled by origin):",
    ...entries.map((e) => `- ${experienceLine(e, now)}`),
    "A remembered lesson may inform a suggestion. It never overrules a current official or provider fact, and its origin is always said out loud.",
  ].join("\n");
}
