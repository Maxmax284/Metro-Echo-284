// calendarResolve — turn "my doctor appointment tomorrow" into one event.
//
// Doctrine: resolve, don't guess. One match is shown. Several are asked about.
// None is said out loud. Nothing here writes, and nothing here is fuzzy enough
// to silently pick a stranger's meeting.

export type ResolvableEvent = {
  feed_id: string | null;
  uid: string | null;
  starts_at: string;
  ends_at?: string | null;
  title: string;
};

export type EventResolution =
  | { status: "one"; event: ResolvableEvent }
  | { status: "many"; candidates: ResolvableEvent[] }
  | { status: "none" };

const STOP = new Set([
  "my", "the", "a", "an", "to", "for", "and", "of", "in", "on", "at", "with", "this",
  "that", "your", "move", "change", "cancel", "add", "put", "reschedule", "shift",
  "appointment", "meeting", "event", "calendar", "please", "make", "it",
]);

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function words(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Day the phrase points at, if it names one. */
export function referencedDay(phrase: string, now: Date): Date | null {
  const p = phrase.toLowerCase();
  if (/\btoday\b|\btonight\b/.test(p)) return new Date(now);
  if (/\btomorrow\b/.test(p)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(p)) {
      const d = new Date(now);
      const delta = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      return d;
    }
  }
  return null;
}

/**
 * Score by word overlap with the title, with a strong bonus when the phrase
 * names the event's day. Events with no overlap at all never win.
 */
export function resolveEventReference(
  phrase: string,
  events: ResolvableEvent[],
  opts?: { now?: Date },
): EventResolution {
  const now = opts?.now ?? new Date();
  const day = referencedDay(phrase, now);
  const tokens = words(phrase);

  const scored = events
    .map((event) => {
      const hay = event.title.toLowerCase();
      let score = tokens.reduce((n, w) => (hay.includes(w) ? n + 2 : n), 0);
      if (day && sameLocalDay(new Date(event.starts_at), day)) score += 3;
      return { event, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.event.starts_at.localeCompare(b.event.starts_at));

  if (!scored.length) return { status: "none" };
  const top = scored[0].score;
  const tied = scored.filter((s) => s.score === top);
  if (tied.length === 1) return { status: "one", event: tied[0].event };
  return { status: "many", candidates: tied.slice(0, 4).map((s) => s.event) };
}

/** Plain lines for what a proposed time would collide with. */
export function findConflicts(
  startsAt: string,
  endsAt: string | null,
  events: ResolvableEvent[],
  excludeUid?: string | null,
): string[] {
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 60 * 60 * 1000;
  if (!Number.isFinite(start)) return [];

  return events
    .filter((event) => {
      if (excludeUid && event.uid && event.uid === excludeUid) return false;
      const s = new Date(event.starts_at).getTime();
      const e = event.ends_at ? new Date(event.ends_at).getTime() : s + 60 * 60 * 1000;
      return Number.isFinite(s) && s < end && e > start;
    })
    .map((event) => `overlaps ${event.title}`);
}
