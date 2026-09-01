// wearable.ts — pure reasoning about watch readings.
//
// Nothing here reads a device or writes a row. It turns recorded readings into
// honest sentences: what arrived, when, and what Vanta still doesn't know. A
// reading that isn't there is never guessed at.
import type { Posture } from "@/lib/awareness";

export type ReadingKind = "heart_rate" | "steps" | "sleep" | "workout" | "stand";
export type ReadingSource = "bluetooth" | "ingest" | "manual";

export interface Reading {
  kind: ReadingKind;
  value: number;
  unit: string;
  measured_at: string;
  source: ReadingSource;
}

export const KIND_LABEL: Record<ReadingKind, string> = {
  heart_rate: "Heart rate",
  steps: "Steps",
  sleep: "Sleep",
  workout: "Workout",
  stand: "Standing",
};

export const SOURCE_LABEL: Record<ReadingSource, string> = {
  bluetooth: "read over Bluetooth",
  ingest: "sent from your phone",
  manual: "entered by hand",
};

/** The most recent reading of a kind, or null when there has never been one. */
export function latest(readings: Reading[], kind: ReadingKind): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) {
    if (r.kind !== kind) continue;
    if (!best || new Date(r.measured_at) > new Date(best.measured_at)) best = r;
  }
  return best;
}

/** Steps recorded for the given day. Ingest sends a running total, so take the highest. */
export function stepsForDay(readings: Reading[], day = new Date()): number | null {
  const key = day.toISOString().slice(0, 10);
  let top: number | null = null;
  for (const r of readings) {
    if (r.kind !== "steps") continue;
    if (r.measured_at.slice(0, 10) !== key) continue;
    top = top === null ? r.value : Math.max(top, r.value);
  }
  return top;
}

/** One line per row in the panel. Off beats empty; empty beats invented. */
export function readingLine(
  kind: ReadingKind,
  reading: Reading | null,
  consented: boolean,
): string {
  if (!consented) return "Switched off. Nothing is read and nothing is stored.";
  if (!reading) {
    return kind === "heart_rate"
      ? "No reading yet. Connect a watch or strap to take one."
      : "Nothing has arrived yet. Set up the phone hand-off to send it.";
  }
  const v =
    kind === "sleep"
      ? `${Math.floor(reading.value / 60)}h ${Math.round(reading.value % 60)}m`
      : `${Math.round(reading.value)}${reading.unit ? ` ${reading.unit}` : ""}`;
  return `${v} · ${SOURCE_LABEL[reading.source]}`;
}

export interface WearableSweep {
  at: string;
  heart_rate: number;
  steps: number;
  sleep: number;
  workout: number;
}

/** A sweep reports a diff, never a status. "Nothing new" is a real answer. */
export function describeWearableSweep(sweep: WearableSweep | null): string {
  if (!sweep) return "Vanta has not read your watch yet.";
  const parts: string[] = [];
  if (sweep.steps) parts.push(`${sweep.steps} step ${sweep.steps === 1 ? "record" : "records"}`);
  if (sweep.heart_rate)
    parts.push(`${sweep.heart_rate} heart-rate ${sweep.heart_rate === 1 ? "reading" : "readings"}`);
  if (sweep.sleep) parts.push(`${sweep.sleep} sleep ${sweep.sleep === 1 ? "record" : "records"}`);
  if (sweep.workout) parts.push(`${sweep.workout} ${sweep.workout === 1 ? "workout" : "workouts"}`);
  if (!parts.length) return "nothing new from your watch.";
  return `${parts.join(", ")}.`;
}

/**
 * A posture suggestion, only when the numbers disagree loudly with what you
 * set by hand. Vanta suggests; it never switches.
 */
export function suggestPosture(
  posture: Posture | null,
  heartRate: Reading | null,
  consented: boolean,
): { posture: Posture; because: string } | null {
  if (!consented || !heartRate) return null;
  const fresh = Date.now() - new Date(heartRate.measured_at).getTime() < 30 * 60_000;
  if (!fresh) return null;
  if (heartRate.value >= 120 && posture !== "training") {
    return { posture: "training", because: `Your heart rate is ${Math.round(heartRate.value)}.` };
  }
  if (heartRate.value <= 55 && posture === "training") {
    return { posture: "quiet", because: `Your heart rate is down to ${Math.round(heartRate.value)}.` };
  }
  return null;
}

export interface WearableFacts {
  anySensorOn: boolean;
  readings: Reading[];
  posture: Posture | null;
  sweep: WearableSweep | null;
  /** A note Vanta held or surfaced because of the posture. */
  postureActedAt: string | null;
}

export interface WalkStep {
  key: string;
  label: string;
  line: string;
  state: "done" | "waiting";
}

/** Five steps, each ticked only by a record that exists. */
export function buildWearableWalk(f: WearableFacts): WalkStep[] {
  const hr = latest(f.readings, "heart_rate");
  const today = stepsForDay(f.readings);
  const first = f.readings.length > 0;

  const step = (key: string, label: string, done: boolean, line: string): WalkStep => ({
    key,
    label,
    line,
    state: done ? "done" : "waiting",
  });

  return [
    step(
      "connected",
      "Watch connected",
      first,
      first
        ? `First reading came in ${SOURCE_LABEL[f.readings[0].source]}.`
        : f.anySensorOn
          ? "No reading yet. Connect a strap or set up the phone hand-off."
          : "No sense is switched on yet.",
    ),
    step(
      "numbers",
      "Numbers arrived",
      hr !== null || today !== null,
      hr
        ? `Last heart rate ${Math.round(hr.value)} bpm.`
        : today !== null
          ? `${today} steps recorded today.`
          : "Nothing measured yet today.",
    ),
    step(
      "posture",
      "Posture known",
      !!f.posture,
      f.posture ? `You set a posture by hand.` : "Set a posture so Vanta knows the moment.",
    ),
    step(
      "adjusted",
      "Vanta adjusted",
      !!f.postureActedAt,
      f.postureActedAt
        ? "A note was held or surfaced because of your posture."
        : "Nothing has been held yet. This ticks the first time posture changes what you hear.",
    ),
    step(
      "today",
      "It shows in Today",
      (hr !== null || today !== null) && !!f.posture,
      (hr !== null || today !== null) && !!f.posture
        ? "The Your body panel in Today reads it back."
        : "Today shows it once a reading and a posture both exist.",
    ),
  ];
}

export function walkProgress(steps: WalkStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}

/** The single folded line for the Today panel. */
export function bodySummary(f: WearableFacts): string {
  if (!f.anySensorOn) return "Your body · nothing switched on yet";
  const hr = latest(f.readings, "heart_rate");
  const steps = stepsForDay(f.readings);
  const bits: string[] = [];
  if (hr) bits.push(`${Math.round(hr.value)} bpm`);
  if (steps !== null) bits.push(`${steps} steps`);
  if (f.posture) bits.push("posture set");
  return bits.length ? `Your body · ${bits.join(" · ")}` : "Your body · nothing measured yet";
}

/* ------------------------------------------------------------------ *
 * Trends. Pure arithmetic over recorded readings. A day with no
 * record is a gap, never a zero — Vanta does not invent a quiet day.
 * ------------------------------------------------------------------ */

export interface DayBucket {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  /** Steps recorded that day, or null when nothing arrived. */
  steps: number | null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One bucket per day, oldest first. Missing days are present with null. */
export function stepsByDay(readings: Reading[], days = 14, now = new Date()): DayBucket[] {
  const top = new Map<string, number>();
  for (const r of readings) {
    if (r.kind !== "steps") continue;
    const k = r.measured_at.slice(0, 10);
    top.set(k, Math.max(top.get(k) ?? 0, r.value));
  }
  const out: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const k = dayKey(d);
    out.push({ day: k, steps: top.has(k) ? Math.round(top.get(k)!) : null });
  }
  return out;
}

/** Median of the numbers given, or null when there are none. */
export function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/** Median of recorded days only, excluding today. Null until there is history. */
export function stepsMedian(buckets: DayBucket[], now = new Date()): number | null {
  const today = dayKey(now);
  return median(
    buckets.filter((b) => b.day !== today && b.steps !== null).map((b) => b.steps as number),
  );
}

export interface Point {
  at: string;
  value: number;
}

/** Heart-rate readings inside the window, oldest first. */
export function heartSeries(readings: Reading[], hours = 48, now = new Date()): Point[] {
  const from = now.getTime() - hours * 3_600_000;
  return readings
    .filter((r) => r.kind === "heart_rate" && new Date(r.measured_at).getTime() >= from)
    .map((r) => ({ at: r.measured_at, value: Math.round(r.value) }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export interface WorkoutEntry {
  at: string;
  minutes: number;
  source: ReadingSource;
}

/** Workouts inside the window, newest first. */
export function workoutList(readings: Reading[], days = 14, now = new Date()): WorkoutEntry[] {
  const from = now.getTime() - days * 86_400_000;
  return readings
    .filter((r) => r.kind === "workout" && new Date(r.measured_at).getTime() >= from)
    .map((r) => ({ at: r.measured_at, minutes: Math.round(r.value), source: r.source }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Plain comparison of today against your own history. Never a scolding. */
export function stepsCompare(buckets: DayBucket[], now = new Date()): string {
  const today = buckets.find((b) => b.day === dayKey(now));
  const med = stepsMedian(buckets, now);
  if (!today || today.steps === null) {
    return med === null
      ? "No step record yet, so there is nothing to compare."
      : `Nothing sent today yet. Your usual day is around ${med} steps.`;
  }
  if (med === null) return `${today.steps} steps today. Not enough history to compare yet.`;
  const diff = today.steps - med;
  if (Math.abs(diff) < Math.max(300, med * 0.1)) {
    return `${today.steps} steps today — about your usual ${med}.`;
  }
  return diff > 0
    ? `${today.steps} steps today, ${diff} above your usual ${med}.`
    : `${today.steps} steps today, ${Math.abs(diff)} below your usual ${med}.`;
}

/* ------------------------------------------------------------------ *
 * Work context. Body facts change how Work speaks and what it leads
 * with. They never create, route, approve or run work.
 * ------------------------------------------------------------------ */

export interface WorkBodyContext {
  /** One line for the desk, or null when there is nothing honest to say. */
  line: string | null;
  /** True when Vanta should keep the desk short right now. */
  keepShort: boolean;
  /** Why it's keeping things short, from a record. */
  because: string | null;
}

export function workBodyContext(
  f: WearableFacts,
  now = new Date(),
): WorkBodyContext {
  if (!f.anySensorOn) return { line: null, keepShort: false, because: null };
  const hr = latest(f.readings, "heart_rate");
  const steps = stepsForDay(f.readings, now);
  const recentWorkout = workoutList(f.readings, 1, now).find(
    (w) => now.getTime() - new Date(w.at).getTime() < 4 * 3_600_000,
  );

  const bits: string[] = [];
  if (recentWorkout) {
    const mins = Math.round((now.getTime() - new Date(recentWorkout.at).getTime()) / 60_000);
    bits.push(
      mins < 90
        ? `Trained ${recentWorkout.minutes} min, ${mins} min ago`
        : `Trained ${recentWorkout.minutes} min earlier today`,
    );
  }
  if (steps !== null) bits.push(`${steps} steps`);
  if (hr && now.getTime() - new Date(hr.measured_at).getTime() < 30 * 60_000) {
    bits.push(`${Math.round(hr.value)} bpm`);
  }
  if (f.posture) bits.push(`you set ${f.posture}`);

  const training = f.posture === "training";
  const working = !!hr && hr.value >= 120 &&
    now.getTime() - new Date(hr.measured_at).getTime() < 30 * 60_000;
  const keepShort = training || working || (!!recentWorkout &&
    now.getTime() - new Date(recentWorkout.at).getTime() < 60 * 60_000);

  const because = !keepShort
    ? null
    : training
      ? "You set Training, so Work leads short."
      : working
        ? `Your heart rate is ${Math.round(hr!.value)}, so Work leads short.`
        : "You trained in the last hour, so Work leads short.";

  return { line: bits.length ? bits.join(" · ") : null, keepShort, because };
}
