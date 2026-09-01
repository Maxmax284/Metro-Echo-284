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
