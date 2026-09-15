// whileYouWereOut — the gap layer. Not a feed, not an unread count.
//
// Doctrine:
//   - it only speaks after a real gap (a coffee break is not being away)
//   - it reports consequence, never volume: "Three things changed", not "27 unread"
//   - nothing here executes; every line is a door into the room that owns it
//   - nothing changed means nothing is said. Silence is a valid answer.

export type AwayChangeKind =
  | "meeting_changed"
  | "needs_you"
  | "waiting_on_you"
  | "arrived"
  | "handled";

export type AwayChange = {
  key: string;
  kind: AwayChangeKind;
  /** Already human, already short. */
  line: string;
  /** ISO time of the underlying record. */
  at: string;
  /** Room that owns the follow-through. */
  surface: string;
};

export type AwayRead = {
  headline: string;
  /** At most three. The rest is counted, never listed. */
  lines: AwayChange[];
  /** How many real changes were found in total. */
  total: number;
  /** Plain sentence for the remainder, or null when nothing is held back. */
  more: string | null;
  /** How long the person was gone, in words. */
  gap: string;
};

/** Under four hours you were not away, you were living. */
export const MIN_AWAY_MS = 4 * 60 * 60 * 1000;

/** Older than this and "while you were out" is the wrong frame — that is just life. */
export const MAX_AWAY_MS = 14 * 24 * 60 * 60 * 1000;

const RANK: Record<AwayChangeKind, number> = {
  meeting_changed: 0,
  needs_you: 1,
  waiting_on_you: 2,
  arrived: 3,
  handled: 4,
};

const WORDS = ["Nothing", "One thing", "Two things", "Three things"];

export function countWord(n: number): string {
  return WORDS[n] ?? `${n} things`;
}

/** Words for the gap, read against the local hour the person came back at. */
export function gapWords(awayMs: number, returnedHour: number): string {
  const hours = awayMs / 3_600_000;
  if (hours >= 14 * 24) return "in the last couple of weeks";
  if (hours >= 44) return "over the last few days";
  if (hours >= 20) return "since yesterday";
  if (hours >= 5 && returnedHour >= 4 && returnedHour < 11) return "overnight";
  return "while you were out";
}

export function shouldSpeak(awayMs: number): boolean {
  return awayMs >= MIN_AWAY_MS && awayMs <= MAX_AWAY_MS;
}

/**
 * One read of the gap. Sorted by consequence first, recency second, capped at
 * three spoken lines so coming back never feels like an inbox.
 */
export function buildAwayRead(input: {
  awayMs: number;
  returnedAt: number;
  changes: AwayChange[];
}): AwayRead | null {
  if (!shouldSpeak(input.awayMs)) return null;

  const seen = new Set<string>();
  const changes = input.changes.filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
  if (changes.length === 0) return null;

  const sorted = [...changes].sort((a, b) => {
    const r = RANK[a.kind] - RANK[b.kind];
    if (r !== 0) return r;
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });

  const lines = sorted.slice(0, 3);
  const rest = sorted.length - lines.length;
  const gap = gapWords(input.awayMs, new Date(input.returnedAt).getHours());

  return {
    headline: `${countWord(sorted.length)} changed ${gap}.`,
    lines,
    total: sorted.length,
    more: rest > 0 ? `${rest} more ${rest === 1 ? "change is" : "changes are"} on the record.` : null,
    gap,
  };
}

/* ---- source-to-line translation. Facts only, no adjectives. ---- */

export function calendarChangeLine(row: {
  id: string;
  title: string | null;
  change: string | null;
  detected_at: string;
}): AwayChange {
  const title = (row.title ?? "An appointment").slice(0, 60);
  const verb =
    row.change === "cancelled"
      ? "was cancelled"
      : row.change === "added"
        ? "was added"
        : row.change === "moved"
          ? "moved"
          : "changed";
  return {
    key: `calendar:${row.id}`,
    kind: "meeting_changed",
    line: `${title} ${verb}.`,
    at: row.detected_at,
    surface: "schedule",
  };
}

export function nudgeLine(row: { id: string; title: string; created_at: string }): AwayChange {
  return {
    key: `nudge:${row.id}`,
    kind: "needs_you",
    line: row.title.slice(0, 80),
    at: row.created_at,
    surface: "work",
  };
}

export function actionLine(row: { id: string; title: string; updated_at: string }): AwayChange {
  return {
    key: `action:${row.id}`,
    kind: "waiting_on_you",
    line: `${row.title.slice(0, 60)} is waiting on your yes.`,
    at: row.updated_at,
    surface: "actions",
  };
}

/** Captures are counted, not listed — ten photos is one fact, not ten. */
export function arrivalsLine(count: number, at: string): AwayChange | null {
  if (count <= 0) return null;
  return {
    key: "arrivals",
    kind: "arrived",
    line: count === 1 ? "One thing landed in your inbox." : `${count} things landed in your inbox.`,
    at,
    surface: "inbox",
  };
}

/** What Echo finished on its own, so coming back is not all bad news. */
export function handledLine(count: number, at: string): AwayChange | null {
  if (count <= 0) return null;
  return {
    key: "handled",
    kind: "handled",
    line: count === 1 ? "One thing was handled already." : `${count} things were handled already.`,
    at,
    surface: "receipts",
  };
}
