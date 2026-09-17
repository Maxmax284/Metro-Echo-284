export type ReminderCandidate = { id: string; summary: string; due_at?: string | null; created_at?: string | null };
export type ReminderResolution =
  | { status: "one"; reminder: ReminderCandidate }
  | { status: "many"; candidates: ReminderCandidate[] }
  | { status: "none" };

const STOP = new Set(["the", "a", "an", "that", "this", "my", "reminder", "please", "remove", "cancel", "delete", "drop", "start", "over", "again", "it", "one"]);
const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP.has(word));

/** How fresh the newest item must be for a bare "that reminder" to claim it. */
const RECENT_MINUTES = 24 * 60;
/** How much newer than the runner-up the newest must be to be the obvious one. */
const CLEARLY_NEWER_MINUTES = 10;

function minutesApart(a?: string | null, b?: string | null): number | null {
  const first = a ? Date.parse(a) : NaN;
  const second = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / 60000;
}

/** A bare "that one" may only claim the newest item when it is genuinely the obvious one. */
function obviousNewest(rows: ReminderCandidate[], now?: Date): ReminderResolution {
  if (rows.length === 1) return { status: "one", reminder: rows[0] };
  const byAge = [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const newest = byAge[0];
  const gap = minutesApart(newest.created_at, byAge[1]?.created_at);
  if (gap !== null && gap < CLEARLY_NEWER_MINUTES) return { status: "many", candidates: byAge.slice(0, 4) };
  const age = now ? minutesApart(newest.created_at, now.toISOString()) : null;
  if (age !== null && age > RECENT_MINUTES) return { status: "many", candidates: byAge.slice(0, 4) };
  return { status: "one", reminder: newest };
}

export function resolveReminderReference(reference: string, rows: ReminderCandidate[], now?: Date): ReminderResolution {
  if (!rows.length) return { status: "none" };
  const wanted = tokens(reference);
  // Words the person actually said always beat "that" — a demonstrative never overrides a name.
  if (!wanted.length) return obviousNewest(rows, now);
  const scored = rows.map((reminder) => ({ reminder, score: wanted.reduce((n, word) => n + (reminder.summary.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.reminder.created_at ?? "").localeCompare(String(a.reminder.created_at ?? "")));
  if (!scored.length) return { status: "none" };
  const tied = scored.filter((row) => row.score === scored[0].score);
  return tied.length === 1 ? { status: "one", reminder: tied[0].reminder } : { status: "many", candidates: tied.slice(0, 4).map((row) => row.reminder) };
}
