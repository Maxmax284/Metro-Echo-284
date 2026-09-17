// bodyProfile — who these numbers belong to, in the person's own words.
//
// Doctrine:
//   - Context, never a verdict. The profile changes how Echo phrases things and
//     what it treats as this person's normal. It never sets a target, never
//     scores, never says a number is good or bad, never gives advice.
//   - Everything is optional and everything is self-reported. A blank field is
//     blank; Echo does not fill it in from readings.
//   - No thresholds live here. Comparison stays against recorded history
//     (bodySense), which is history and not a published ideal.
//
// Pure module.

export type LifeMode = "everyday" | "active" | "athlete";
export type Build = "slight" | "average" | "solid" | "large";
export type SleepHabit = "early" | "regular" | "late" | "broken";

export type BodyProfile = {
  age_band?: string | null;      // "20s" … "70+"
  height_cm?: number | null;
  build?: Build | null;
  life_mode?: LifeMode | null;
  main_activity?: string | null; // "Muay Thai", "walking the dog"
  sleep_habit?: SleepHabit | null;
  training_days?: number[] | null; // 0 = Sunday
  /** Anything the person wants Echo to keep in mind. Their words, kept as-is. */
  keep_in_mind?: string | null;
  updated_at?: string | null;
};

export const AGE_BANDS = ["teens", "20s", "30s", "40s", "50s", "60s", "70+"] as const;

export const LIFE_MODE_LABEL: Record<LifeMode, string> = {
  everyday: "Everyday life",
  active: "Active",
  athlete: "Athlete",
};

export const BUILD_LABEL: Record<Build, string> = {
  slight: "Slight",
  average: "Average",
  solid: "Solid",
  large: "Large",
};

export const SLEEP_HABIT_LABEL: Record<SleepHabit, string> = {
  early: "Early nights",
  regular: "Regular hours",
  late: "Late nights",
  broken: "Broken sleep",
};

const DAY_WORD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const BODY_PROFILE_LAW =
  "This is context, not a target. Echo uses it to phrase what it says. It never scores you and never gives advice.";

/** Keep only what is recognisable. Junk is dropped, never coerced into a value. */
export function sanitizeBodyProfile(input: unknown): BodyProfile {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: BodyProfile = {};
  const age = String(raw.age_band ?? "").trim();
  if ((AGE_BANDS as readonly string[]).includes(age)) out.age_band = age;
  const height = Number(raw.height_cm);
  if (Number.isFinite(height) && height >= 100 && height <= 250) out.height_cm = Math.round(height);
  if (typeof raw.build === "string" && raw.build in BUILD_LABEL) out.build = raw.build as Build;
  if (typeof raw.life_mode === "string" && raw.life_mode in LIFE_MODE_LABEL) out.life_mode = raw.life_mode as LifeMode;
  if (typeof raw.sleep_habit === "string" && raw.sleep_habit in SLEEP_HABIT_LABEL) out.sleep_habit = raw.sleep_habit as SleepHabit;
  const activity = String(raw.main_activity ?? "").trim();
  if (activity) out.main_activity = activity.slice(0, 80);
  const mind = String(raw.keep_in_mind ?? "").trim();
  if (mind) out.keep_in_mind = mind.slice(0, 400);
  if (Array.isArray(raw.training_days)) {
    const days = [...new Set(raw.training_days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))].sort();
    if (days.length) out.training_days = days;
  }
  const at = String(raw.updated_at ?? "").trim();
  if (at && Number.isFinite(Date.parse(at))) out.updated_at = new Date(at).toISOString();
  return out;
}

/** True when there is anything at all worth saying about the person. */
export function hasBodyProfile(p: BodyProfile | null | undefined): boolean {
  if (!p) return false;
  return Object.values(p).some((v) => v !== null && v !== undefined && v !== "" &&
    !(Array.isArray(v) && v.length === 0));
}

/** Plain lines for the desk. Nothing is stated that was not filled in. */
export function bodyProfileLines(p: BodyProfile | null | undefined): string[] {
  if (!p) return [];
  const lines: string[] = [];
  const first: string[] = [];
  if (p.age_band) first.push(p.age_band);
  if (p.build) first.push(BUILD_LABEL[p.build].toLowerCase());
  if (p.height_cm) first.push(`${p.height_cm} cm`);
  if (first.length) lines.push(first.join(" · "));
  if (p.life_mode) {
    lines.push(p.main_activity
      ? `${LIFE_MODE_LABEL[p.life_mode]} · ${p.main_activity}`
      : LIFE_MODE_LABEL[p.life_mode]);
  } else if (p.main_activity) {
    lines.push(p.main_activity);
  }
  if (p.sleep_habit) lines.push(SLEEP_HABIT_LABEL[p.sleep_habit]);
  if (p.training_days?.length) {
    lines.push(`Trains ${p.training_days.map((d) => DAY_WORD[d]).join(", ")}`);
  }
  if (p.keep_in_mind) lines.push(p.keep_in_mind);
  return lines;
}

/**
 * The prompt block. Handed over as facts the person stated about themselves,
 * with the rule that it colours wording only. Empty in, empty out.
 */
export function bodyProfileBlock(p: BodyProfile | null | undefined): string {
  const lines = bodyProfileLines(p);
  if (!lines.length) return "";
  return [
    "WHAT THEY TOLD YOU ABOUT THEMSELVES (self-reported, context only):",
    ...lines.map((l) => `- ${l}`),
    "Use it for wording and for what counts as their normal. Never turn it into a target, a score, a health judgement or advice.",
  ].join("\n");
}

/** Is today a day this person said they usually train? */
export function trainsOn(p: BodyProfile | null | undefined, when = new Date()): boolean {
  return !!p?.training_days?.includes(when.getDay());
}
