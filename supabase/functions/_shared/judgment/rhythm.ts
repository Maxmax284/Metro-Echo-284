// rhythm — when something matters, without nagging and without surveillance.
//
// Doctrine:
//   - Routines come from explicit recurring calendar entries and from what the
//     person told Echo. Nothing is inferred from covert tracking, location
//     history, or anything the person did not hand over.
//   - A routine changes timing and compression. It never becomes a dashboard,
//     a streak, a habit score or a category.
//   - Stale routines decay and die. If it has not been seen in a while, Echo
//     stops assuming it.
//
// Pure module.

export type RhythmOrigin = "recurring_event" | "user_stated";

export type Rhythm = {
  id: string;
  /** Plain words: "training", "stadium shift", "clinic run". */
  label: string;
  origin: RhythmOrigin;
  /** 0 = Sunday. Empty means no weekday pattern is known. */
  weekdays: number[];
  /** Local wall clock "HH:MM", when one is recorded. */
  atLocal?: string | null;
  /** ISO time it was last actually observed or restated. */
  lastSeenAt: string;
  /** How many times it has been seen. Evidence, not a score. */
  seen: number;
};

const DAY = 24 * 60 * 60 * 1000;
/** Unseen for this long and Echo stops assuming it. */
export const RHYTHM_DECAY_DAYS = 28;

export type RecurringEvent = {
  title: string;
  startsAt: string;
  /** True only when the calendar itself says it repeats. */
  recurring: boolean;
  timezone?: string | null;
};

/** Build rhythms from explicit recurring calendar entries only. */
export function learnRhythms(events: RecurringEvent[], now = new Date()): Rhythm[] {
  const byLabel = new Map<string, Rhythm>();
  for (const e of events) {
    if (!e.recurring) continue;
    const at = Date.parse(e.startsAt);
    if (!Number.isFinite(at)) continue;
    const label = e.title.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const when = new Date(at);
    const existing = byLabel.get(key);
    const weekday = when.getUTCDay();
    if (existing) {
      if (!existing.weekdays.includes(weekday)) existing.weekdays.push(weekday);
      existing.seen += 1;
      if (at > Date.parse(existing.lastSeenAt) && at <= now.getTime()) existing.lastSeenAt = when.toISOString();
    } else {
      byLabel.set(key, {
        id: key.replace(/[^a-z0-9]+/g, "-"),
        label,
        origin: "recurring_event",
        weekdays: [weekday],
        atLocal: `${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}`,
        lastSeenAt: when.toISOString(),
        seen: 1,
      });
    }
  }
  return [...byLabel.values()].map((r) => ({ ...r, weekdays: r.weekdays.sort() }));
}

/** A routine the person stated in words. Same shape, honest origin. */
export function statedRhythm(label: string, weekdays: number[], atLocal: string | null, now = new Date()): Rhythm {
  return {
    id: label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: label.trim(),
    origin: "user_stated",
    weekdays: [...weekdays].sort(),
    atLocal,
    lastSeenAt: now.toISOString(),
    seen: 1,
  };
}

export function isLive(rhythm: Rhythm, now = new Date()): boolean {
  const seen = Date.parse(rhythm.lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return now.getTime() - seen <= RHYTHM_DECAY_DAYS * DAY;
}

/** Live routines only. Anything gone quiet is dropped, not aged into fact. */
export function activeRhythms(rhythms: Rhythm[], now = new Date()): Rhythm[] {
  return rhythms.filter((r) => isLive(r, now) && r.seen >= 2 || (r.origin === "user_stated" && isLive(r, now)));
}

/** What is on today, from live routines only. */
export function rhythmsToday(rhythms: Rhythm[], now = new Date()): Rhythm[] {
  const weekday = now.getUTCDay();
  return activeRhythms(rhythms, now).filter((r) => r.weekdays.includes(weekday));
}

/**
 * The line the doctrine asks for: one thing changed before the thing that
 * matters tonight, everything else is clear. Silence when nothing needs anyone.
 */
export function rhythmLine(
  today: Rhythm[],
  changedCount: number,
  now = new Date(),
): string {
  const next = today
    .filter((r) => r.atLocal)
    .sort((a, b) => String(a.atLocal).localeCompare(String(b.atLocal)))[0];
  const head = changedCount === 0
    ? "Nothing changed"
    : `${changedCount} thing${changedCount === 1 ? "" : "s"} changed`;
  if (!next) return changedCount === 0 ? "Nothing needs you." : `${head}. Nothing else needs you.`;
  const before = ` before ${next.label.toLowerCase()}${next.atLocal ? ` at ${next.atLocal}` : ""}`;
  return changedCount === 0
    ? `${next.label} is clear${next.atLocal ? ` at ${next.atLocal}` : ""}. Nothing needs you.`
    : `${head}${before}. Nothing else needs you.`;
}

export function rhythmBlock(rhythms: Rhythm[], now = new Date()): string {
  const live = activeRhythms(rhythms, now);
  if (!live.length) return "";
  return [
    "Recorded routines (from repeating calendar entries and what the person told you — never from tracking):",
    ...live.map((r) => `- ${r.label}${r.atLocal ? ` around ${r.atLocal}` : ""}, ${r.origin === "user_stated" ? "they told you" : "repeats on their calendar"}.`),
    "Use these for timing and for saying less. Do not list them back, do not build a schedule out of them, do not assume one that is not here.",
  ].join("\n");
}
