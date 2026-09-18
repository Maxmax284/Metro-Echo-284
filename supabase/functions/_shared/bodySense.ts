// bodySense — "how does this stretch compare with your usual", from recorded
// readings only.
//
// Doctrine:
//   - Observation, never diagnosis. Echo says you slept less than usual. It
//     never says that is bad, never says what to do about it, and never invents
//     a number nothing recorded.
//   - "Usual" is history, not a published ideal. Too little history means there
//     is no usual yet, and Echo says exactly that instead of comparing against
//     nothing.
//   - A small wobble is not news. A day inside the noise band reads as about
//     the same, and a kind with no recent reading is left out rather than
//     treated as a zero.
//   - Pure module: no IO, no React, so every rule below is testable.

import { BODY_DISCLAIMER, type BodyEntry } from "./bodyLog.ts";

export type SenseReading = Pick<BodyEntry, "kind" | "value" | "measured_at">;

/** How a kind adds up over a day: a total, or a level. */
type Mode = "total" | "level";

const MODE: Record<string, Mode> = {
  steps: "total",
  active_minutes: "total",
  workout_minutes: "total",
  training_minutes: "total",
  caffeine_mg: "total",
  water_ml: "total",
  calories: "total",
  sleep_minutes: "total",
  sleep: "total",
  heart_rate: "level",
  hr: "level",
  resting_heart_rate: "level",
  hrv: "level",
  spo2: "level",
  weight: "level",
  stress: "level",
  temperature: "level",
  bp_systolic: "level",
  bp_diastolic: "level",
  pulse: "level",
};

/** Plain words for a move, written so no line can be read as a verdict. */
const WORDS: Record<string, { up: string; down: string; same: string }> = {
  sleep_minutes: { up: "slept more", down: "slept less", same: "slept about the same" },
  sleep: { up: "slept more", down: "slept less", same: "slept about the same" },
  workout_minutes: { up: "trained harder", down: "trained lighter", same: "trained about the same" },
  training_minutes: { up: "trained harder", down: "trained lighter", same: "trained about the same" },
  active_minutes: { up: "moved more", down: "moved less", same: "moved about the same" },
  steps: { up: "walked more", down: "walked less", same: "walked about the same" },
  caffeine_mg: {
    up: "had more caffeine",
    down: "had less caffeine",
    same: "had about the same caffeine",
  },
  water_ml: { up: "drank more water", down: "drank less water", same: "drank about the same water" },
  calories: { up: "ate more", down: "ate less", same: "ate about the same" },
  hrv: {
    up: "heart-rate variability ran higher",
    down: "heart-rate variability ran lower",
    same: "heart-rate variability held steady",
  },
  heart_rate: {
    up: "resting heart rate ran higher",
    down: "resting heart rate ran lower",
    same: "resting heart rate held steady",
  },
  resting_heart_rate: {
    up: "resting heart rate ran higher",
    down: "resting heart rate ran lower",
    same: "resting heart rate held steady",
  },
  weight: { up: "weight read higher", down: "weight read lower", same: "weight held steady" },
  spo2: { up: "blood oxygen read higher", down: "blood oxygen read lower", same: "blood oxygen held steady" },
  stress: { up: "stress score read higher", down: "stress score read lower", same: "stress score held steady" },
};

/** Below this much difference, nothing moved worth mentioning. */
export const NOISE_PCT = 10;

/**
 * Some kinds move in a narrower band than others. Body weight swings a few
 * percent at most, so a 10% rule would mean weight never reads as news at all.
 * These are per-kind noise bands, still measured against this person's own
 * recorded usual — no published ideal anywhere.
 */
export const NOISE_BY_KIND: Record<string, number> = {
  weight: 3,
  temperature: 2,
  spo2: 2,
  bp_systolic: 6,
  bp_diastolic: 6,
};

/** Fewer recorded days than this on either side and there is no comparison. */
export const MIN_DAYS = 3;

function dayKey(iso: string): string {
  return String(iso).slice(0, 10);
}

/** One number per day for one kind: a total for totals, a mean for levels. */
export function perDay(rows: SenseReading[], kind: string): Map<string, number> {
  const mode = MODE[kind] ?? "level";
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    const key = dayKey(r.measured_at);
    const held = buckets.get(key) ?? [];
    held.push(v);
    buckets.set(key, held);
  }
  const out = new Map<string, number>();
  for (const [key, vals] of buckets) {
    out.set(key, mode === "total" ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

export type Move = {
  kind: string;
  direction: "up" | "down" | "same";
  recent: number;
  usual: number;
  pct: number;
  recentDays: number;
  usualDays: number;
  words: string;
};

function moveWords(kind: string, direction: Move["direction"]): string {
  const set = WORDS[kind];
  if (set) return set[direction];
  const label = kind.replace(/_/g, " ");
  if (direction === "same") return `${label} held steady`;
  return `${label} read ${direction === "up" ? "higher" : "lower"} than usual`;
}

/**
 * One kind, recent stretch against the stretch before it. Null when either side
 * has too few recorded days to call anything usual.
 */
export function compareKind(
  rows: SenseReading[],
  kind: string,
  opts: { now?: Date; recentDays?: number; usualDays?: number } = {},
): Move | null {
  const now = opts.now ?? new Date();
  const recentDays = opts.recentDays ?? 3;
  const usualDays = opts.usualDays ?? 14;
  const byDay = perDay(rows, kind);
  const cutRecent = dayKey(new Date(now.getTime() - recentDays * 86_400_000).toISOString());
  const cutUsual = dayKey(new Date(now.getTime() - (recentDays + usualDays) * 86_400_000).toISOString());

  const recent: number[] = [];
  const usual: number[] = [];
  for (const [key, val] of byDay) {
    if (key > cutRecent) recent.push(val);
    else if (key > cutUsual) usual.push(val);
  }
  if (recent.length === 0 || usual.length < MIN_DAYS) return null;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r = mean(recent);
  const u = mean(usual);
  if (u === 0) return null;
  const pct = ((r - u) / Math.abs(u)) * 100;
  const band = NOISE_BY_KIND[kind] ?? NOISE_PCT;
  const direction: Move["direction"] = Math.abs(pct) < band ? "same" : pct > 0 ? "up" : "down";
  return {
    kind,
    direction,
    recent: Math.round(r * 10) / 10,
    usual: Math.round(u * 10) / 10,
    pct: Math.round(pct),
    recentDays: recent.length,
    usualDays: usual.length,
    words: moveWords(kind, direction),
  };
}

/** Every kind with enough history, loudest move first. */
export function compareBody(
  rows: SenseReading[],
  opts: { now?: Date; recentDays?: number; usualDays?: number } = {},
): Move[] {
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const moves = kinds
    .map((k) => compareKind(rows, k, opts))
    .filter((m): m is Move => m !== null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return moves;
}

/**
 * The comparison in words. Movement first, steady things folded into one tail
 * line, and the disclaimer on every answer so no screen can imply a verdict.
 */
export function bodySenseAnswer(
  rows: SenseReading[],
  opts: { now?: Date; recentDays?: number; usualDays?: number } = {},
): string {
  const recentDays = opts.recentDays ?? 3;
  const moves = compareBody(rows, opts);
  if (moves.length === 0) {
    return `There is not enough recorded history to say what your usual looks like yet — Echo needs at least ${MIN_DAYS} earlier days of readings to compare against. ${BODY_DISCLAIMER}`;
  }
  const moved = moves.filter((m) => m.direction !== "same");
  const steady = moves.filter((m) => m.direction === "same");
  const window = recentDays === 1 ? "Today" : `The last ${recentDays} days`;

  const lines: string[] = [];
  if (moved.length > 0) {
    const list = moved.map((m) => `${m.words} (${m.recent} against a usual ${m.usual})`);
    const joined =
      list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
    lines.push(`${window} against your own usual: you ${joined}.`);
  } else {
    lines.push(`${window} look like your usual across everything recorded.`);
  }
  if (steady.length > 0 && moved.length > 0) {
    lines.push(`Steady: ${steady.map((m) => m.words).join(", ")}.`);
  }
  lines.push(`Usual here means your own last ${moves[0].usualDays} recorded days, nothing published.`);
  lines.push(BODY_DISCLAIMER);
  return lines.join(" ");
}

export const BODY_SENSE_LAW =
  "Echo compares your recorded numbers with your own history and stops there. It does not judge them, explain them, or tell you what to do about them.";
