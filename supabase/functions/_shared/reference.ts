// reference — one rule for "which one did they mean?", across every ability.
//
// Today's real bug: a complete new request ("appointment at the Villas Tuesday
// 1pm") attached itself to the newest unrelated old thing (a storage unit
// reminder) because the code reached for the most recent row. That is a family
// of risks, not one bug. Calendar and reminders were hardened first; this is the
// shared principle so watches, filing, notes and flights cannot repeat it.
//
// Doctrine:
//   - Words the person actually said always beat a demonstrative. "that" never
//     overrules "the Villas".
//   - A bare "that one" may only claim the newest item when it is obviously the
//     newest: clearly ahead of the runner-up, and recent.
//   - Two plausible matches means ask once. Guessing confidently is the failure.
//   - A working pointer expires. Stale state may not masquerade as fresh truth.
//   - Two independent asks in one message are never mashed into one action.
//
// Pure module.

export type Referable = {
  id: string;
  /** What the person would call it. */
  label: string;
  /** ISO. Used only for "is this obviously the newest one". */
  createdAt?: string | null;
};

export type ReferenceResolution<T extends Referable> =
  | { status: "one"; item: T }
  | { status: "many"; candidates: T[] }
  | { status: "none" };

/** Words that point at context rather than naming a thing. */
const DEMONSTRATIVES = /\b(that|this|it|those|these|the last one|the latest|same one)\b/i;

const STOP = new Set([
  "the", "a", "an", "that", "this", "those", "these", "my", "our", "please",
  "it", "one", "same", "last", "latest", "thing", "put", "file", "under",
  "add", "move", "stop", "cancel", "remove", "delete", "drop", "watch",
  "watching", "keep", "eye", "note", "reminder", "commitment", "project",
  "and", "for", "with", "about", "from", "into", "onto",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

/** How fresh the newest item must be for a bare "that one" to claim it. */
export const OBVIOUS_RECENT_MINUTES = 24 * 60;
/** How far ahead of the runner-up the newest must be to be the obvious one. */
export const OBVIOUS_GAP_MINUTES = 10;

function minutesApart(a?: string | null, b?: string | null): number | null {
  const first = a ? Date.parse(a) : NaN;
  const second = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / 60000;
}

function obviousNewest<T extends Referable>(rows: T[], now?: Date): ReferenceResolution<T> {
  if (rows.length === 1) return { status: "one", item: rows[0] };
  const byAge = [...rows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const newest = byAge[0];
  const gap = minutesApart(newest.createdAt, byAge[1]?.createdAt);
  if (gap !== null && gap < OBVIOUS_GAP_MINUTES) return { status: "many", candidates: byAge.slice(0, 4) };
  const age = now ? minutesApart(newest.createdAt, now.toISOString()) : null;
  if (age !== null && age > OBVIOUS_RECENT_MINUTES) return { status: "many", candidates: byAge.slice(0, 4) };
  return { status: "one", item: newest };
}

/**
 * Resolve what the person referred to. Content words win, ties ask, a bare
 * demonstrative only claims the obvious newest, and nothing matching returns
 * none rather than the first row.
 */
export function resolveReference<T extends Referable>(
  reference: string,
  rows: T[],
  now?: Date,
): ReferenceResolution<T> {
  if (!rows.length) return { status: "none" };
  const wanted = tokens(reference ?? "");
  if (!wanted.length) {
    if (!DEMONSTRATIVES.test(reference ?? "")) {
      return rows.length === 1 ? { status: "one", item: rows[0] } : { status: "many", candidates: rows.slice(0, 4) };
    }
    return obviousNewest(rows, now);
  }
  const scored = rows
    .map((item) => ({
      item,
      score: wanted.reduce((n, word) => n + (item.label.toLowerCase().includes(word) ? 1 : 0), 0),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.createdAt ?? "").localeCompare(String(a.item.createdAt ?? "")));
  if (!scored.length) return { status: "none" };
  const best = scored[0].score;
  const tied = scored.filter((row) => row.score === best);
  return tied.length === 1
    ? { status: "one", item: tied[0].item }
    : { status: "many", candidates: tied.slice(0, 4).map((row) => row.item) };
}

/** One question, asked once, instead of a confident wrong guess. */
export function askWhichOne<T extends Referable>(candidates: T[], noun = "one"): string {
  const list = candidates.slice(0, 4).map((c) => `“${c.label}”`).join(", ");
  return `Which ${noun} do you mean — ${list}? Say the words and I'll use that one.`;
}

/**
 * A stored working pointer is only truth for a while. Anything older is treated
 * as gone, so a stale id can never answer a fresh question.
 */
export function pointerIsFresh(setAt: string | null | undefined, ttlMinutes: number, now = new Date()): boolean {
  if (!setAt) return false;
  const at = Date.parse(setAt);
  if (!Number.isFinite(at)) return false;
  const age = (now.getTime() - at) / 60000;
  return age >= 0 && age <= ttlMinutes;
}

/** Default life of a Telegram working pointer. Long enough to finish a thought. */
export const POINTER_TTL_MINUTES = 30;

const ACTION_VERB = /\b(remind|remember|book|schedule|set|add|move|cancel|file|put|note|watch|stop|check|find|send|call|pay|order|remove|delete|draft|log|track)\b/i;
const JOINER = /\s+(?:and (?:also|then)|also,|;|\.\s+(?:also|and also))\s+/i;

/**
 * Two independent asks in one message. Only splits when both halves genuinely
 * ask for something — "flight lands late and training is tomorrow" is one
 * situation, not two requests, and must stay whole.
 */
export function splitRequests(text: string): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(JOINER).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [clean];
  const asks = parts.filter((p) => ACTION_VERB.test(p));
  return asks.length >= 2 ? parts : [clean];
}

/** The one-at-a-time reply. Never silently mashes two asks into one action. */
export function askOneAtATime(parts: string[]): string {
  const [first, second] = parts;
  return [
    "That's two things, and I'd rather get both right than half-do them together.",
    `First: ${first.replace(/[.?!]+$/, "")}. Then: ${second.replace(/[.?!]+$/, "")}.`,
    "Send the first one and I'll handle it, then the second.",
  ].join(" ");
}
