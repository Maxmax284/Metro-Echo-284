// bodyLoad — rest and effort as a practical constraint, not a health verdict.
//
// Doctrine:
//   - Recorded readings only. No reading means no claim: `null`, never a guess
//     and never a zero.
//   - It reports state, never a judgement. "Four hours recorded last night" is
//     a fact. "You are tired and should rest" is advice, and Echo does not
//     give advice.
//   - This is a friction input. Short sleep or a hard session makes a
//     hassle-heavy option worth mentioning; it never blocks anything, never
//     interrupts on its own, and never reaches a wearable as an approval.
//   - Pure module.

export type LoadReading = { kind: string; value: number; measured_at: string };

export type BodyLoad = {
  /** Minutes recorded for the most recent night, when one was recorded. */
  sleepMinutes: number | null;
  /** The person's own median over the window, when there is enough history. */
  sleepUsualMinutes: number | null;
  /** Workout minutes recorded today. */
  trainedTodayMinutes: number | null;
  /** True only when both a night and a usual exist and the night is well under. */
  shortNight: boolean;
  /** What could not be said, in plain words. */
  unknown: string[];
};

const DAY = 24 * 60 * 60 * 1000;
/** Below this share of their own usual counts as a short night. */
const SHORT_NIGHT_RATIO = 0.8;
/** Fewer nights than this and there is no usual yet. */
const MIN_NIGHTS = 3;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Read the window. Sleep is stored in minutes by the hand-off. */
export function readBodyLoad(readings: LoadReading[], now = new Date(), windowDays = 14): BodyLoad {
  const since = now.getTime() - windowDays * DAY;
  const nights = new Map<string, number>();
  let latestNight: { at: number; minutes: number } | null = null;
  let trainedToday: number | null = null;
  const today = now.toISOString().slice(0, 10);

  for (const r of readings) {
    const at = Date.parse(r.measured_at);
    if (!Number.isFinite(at) || at < since) continue;
    if (r.kind === "sleep") {
      const day = new Date(at).toISOString().slice(0, 10);
      nights.set(day, Math.max(nights.get(day) ?? 0, r.value));
      if (!latestNight || at > latestNight.at) latestNight = { at, minutes: r.value };
    }
    if ((r.kind === "workout" || r.kind === "active_minutes") &&
        new Date(at).toISOString().slice(0, 10) === today) {
      trainedToday = (trainedToday ?? 0) + r.value;
    }
  }

  const nightValues = [...nights.values()];
  const usual = nightValues.length >= MIN_NIGHTS ? median(nightValues) : null;
  const last = latestNight?.minutes ?? null;
  const unknown: string[] = [];
  if (last === null) unknown.push("no sleep recorded");
  if (usual === null) unknown.push("not enough nights recorded to know their usual");
  if (trainedToday === null) unknown.push("no session recorded today");

  return {
    sleepMinutes: last,
    sleepUsualMinutes: usual,
    trainedTodayMinutes: trainedToday,
    shortNight: last !== null && usual !== null && last < usual * SHORT_NIGHT_RATIO,
    unknown,
  };
}

const hm = (m: number): string => {
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${h}h ${rest}m` : `${h}h`;
};

/**
 * The prompt block. Facts and nothing else, with the standing rule that this
 * is not a health reading. Empty when nothing was recorded.
 */
export function bodyLoadBlock(load: BodyLoad | null | undefined): string {
  if (!load) return "";
  const lines: string[] = [];
  if (load.sleepMinutes !== null) {
    lines.push(
      load.sleepUsualMinutes !== null
        ? `- Last night recorded: ${hm(load.sleepMinutes)} (their usual is about ${hm(load.sleepUsualMinutes)}).`
        : `- Last night recorded: ${hm(load.sleepMinutes)}.`,
    );
  }
  if (load.trainedTodayMinutes !== null) {
    lines.push(`- Recorded today: ${Math.round(load.trainedTodayMinutes)} minutes of training or activity.`);
  }
  if (!lines.length) return "";
  if (load.shortNight) {
    lines.push("- That is well under their own usual, so an option with fewer steps is worth naming.");
  }
  return [
    "REST AND EFFORT (recorded readings, context only):",
    ...lines,
    "This is not a health reading. Do not diagnose, do not advise, do not tell them to rest. Mention it only when it changes which practical option makes sense.",
  ].join("\n");
}
