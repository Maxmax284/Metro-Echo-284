export type ReminderCandidate = { id: string; summary: string; due_at?: string | null; created_at?: string | null };
export type ReminderResolution =
  | { status: "one"; reminder: ReminderCandidate }
  | { status: "many"; candidates: ReminderCandidate[] }
  | { status: "none" };

const STOP = new Set(["the", "a", "an", "that", "this", "my", "reminder", "please", "remove", "cancel", "delete", "drop", "start", "over", "again", "it", "one"]);
const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP.has(word));

export function resolveReminderReference(reference: string, rows: ReminderCandidate[]): ReminderResolution {
  if (!rows.length) return { status: "none" };
  const wanted = tokens(reference);
  if (!wanted.length) return rows.length === 1 ? { status: "one", reminder: rows[0] } : { status: "many", candidates: rows.slice(0, 4) };
  const scored = rows.map((reminder) => ({ reminder, score: wanted.reduce((n, word) => n + (reminder.summary.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.reminder.created_at ?? "").localeCompare(String(a.reminder.created_at ?? "")));
  if (!scored.length) return { status: "none" };
  const tied = scored.filter((row) => row.score === scored[0].score);
  return tied.length === 1 ? { status: "one", reminder: tied[0].reminder } : { status: "many", candidates: tied.slice(0, 4).map((row) => row.reminder) };
}