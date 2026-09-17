// bodyKinds — the one list of body readings Metro Echo will accept.
//
// Doctrine:
//   - One registry. The hand-off, the desk, the trends and the tests read the
//     same list, so a reading that arrives is a reading that shows up.
//   - Phones name things their own way. Aliases translate the common exports
//     (Apple Health / Health Auto Export, Health Connect) into Echo's kinds.
//     An unknown name is refused plainly, never guessed at.
//   - Consent is per group, not one blunt switch: everyday body numbers,
//     movement, sleep. Absent consent means off.
//   - No thresholds live here. A kind has a name and a unit. Nothing in this
//     file knows what "good" would mean.
//
// Pure module.

export type BodyKindGroup = "body_basics" | "activity" | "sleep";

export type BodyKindSpec = {
  kind: string;
  label: string;
  /** The unit Echo stores it in when the sender gives none. */
  unit: string;
  group: BodyKindGroup;
};

export const BODY_KIND_SPECS: BodyKindSpec[] = [
  { kind: "heart_rate", label: "Heart rate", unit: "bpm", group: "body_basics" },
  { kind: "resting_heart_rate", label: "Resting heart rate", unit: "bpm", group: "body_basics" },
  { kind: "hrv", label: "Heart rate variability", unit: "ms", group: "body_basics" },
  { kind: "spo2", label: "Blood oxygen", unit: "%", group: "body_basics" },
  { kind: "respiratory_rate", label: "Breathing rate", unit: "breaths/min", group: "body_basics" },
  { kind: "temperature", label: "Temperature", unit: "°C", group: "body_basics" },
  { kind: "weight", label: "Weight", unit: "kg", group: "body_basics" },
  { kind: "body_fat", label: "Body fat", unit: "%", group: "body_basics" },
  { kind: "bp_systolic", label: "Blood pressure (upper)", unit: "mmHg", group: "body_basics" },
  { kind: "bp_diastolic", label: "Blood pressure (lower)", unit: "mmHg", group: "body_basics" },
  { kind: "pulse", label: "Pulse", unit: "bpm", group: "body_basics" },

  { kind: "steps", label: "Steps", unit: "steps", group: "activity" },
  { kind: "stand", label: "Standing", unit: "h", group: "activity" },
  { kind: "workout", label: "Workout", unit: "min", group: "activity" },
  { kind: "active_minutes", label: "Active minutes", unit: "min", group: "activity" },
  { kind: "calories", label: "Active energy", unit: "kcal", group: "activity" },
  { kind: "distance_walk", label: "Walking distance", unit: "km", group: "activity" },
  { kind: "distance_cycle", label: "Cycling distance", unit: "km", group: "activity" },

  { kind: "sleep", label: "Sleep", unit: "min", group: "sleep" },
];

export const BODY_KIND_MAP: Record<string, BodyKindSpec> = Object.fromEntries(
  BODY_KIND_SPECS.map((s) => [s.kind, s]),
);

/** What phones actually call these things. Left side is lower-cased, no spaces. */
const ALIASES: Record<string, string> = {
  hr: "heart_rate",
  heartrate: "heart_rate",
  heart_rate_bpm: "heart_rate",
  restingheartrate: "resting_heart_rate",
  resting_hr: "resting_heart_rate",
  heart_rate_variability: "hrv",
  heartratevariability: "hrv",
  hrv_sdnn: "hrv",
  oxygen_saturation: "spo2",
  oxygensaturation: "spo2",
  blood_oxygen: "spo2",
  respiratoryrate: "respiratory_rate",
  breathing_rate: "respiratory_rate",
  body_temperature: "temperature",
  basal_body_temperature: "temperature",
  body_mass: "weight",
  bodymass: "weight",
  body_weight: "weight",
  body_fat_percentage: "body_fat",
  bodyfatpercentage: "body_fat",
  blood_pressure_systolic: "bp_systolic",
  systolic: "bp_systolic",
  blood_pressure_diastolic: "bp_diastolic",
  diastolic: "bp_diastolic",
  step_count: "steps",
  stepcount: "steps",
  stand_hours: "stand",
  standhours: "stand",
  apple_stand_hours: "stand",
  workout_minutes: "workout",
  training_minutes: "workout",
  exercise_time: "active_minutes",
  apple_exercise_time: "active_minutes",
  activeminutes: "active_minutes",
  active_energy: "calories",
  activeenergy: "calories",
  active_energy_burned: "calories",
  walking_running_distance: "distance_walk",
  distance_walking_running: "distance_walk",
  cycling_distance: "distance_cycle",
  distance_cycling: "distance_cycle",
  sleep_analysis: "sleep",
  sleep_minutes: "sleep",
  sleep_duration: "sleep",
  asleep: "sleep",
  time_asleep: "sleep",
};

/** Resolve whatever a phone called it. Null when Echo has no such kind. */
export function specFor(name: unknown): BodyKindSpec | null {
  const raw = String(name ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return null;
  const direct = BODY_KIND_MAP[raw];
  if (direct) return direct;
  const aliased = ALIASES[raw] ?? ALIASES[raw.replace(/_/g, "")];
  return aliased ? BODY_KIND_MAP[aliased] ?? null : null;
}

/**
 * Consent for one group. `sensor_consent` may only carry the older single
 * `activity` switch, so that stands in until a group is set explicitly —
 * absent everywhere still means off.
 */
export function groupAllowed(
  group: BodyKindGroup,
  consent: Record<string, unknown> | null | undefined,
): boolean {
  const c = consent ?? {};
  const own = c[group];
  if (typeof own === "boolean") return own;
  /* Older accounts only ever had one switch. It stands in until a group is set
     explicitly; heart rate had its own switch, so it counts for body basics. */
  if (group === "body_basics" && typeof c.heart_rate === "boolean") return c.heart_rate === true;
  return c.activity === true;
}

export type IncomingReading = {
  kind?: unknown;
  value?: unknown;
  unit?: unknown;
  measured_at?: unknown;
};

export type AcceptedReading = {
  kind: string;
  value: number;
  unit: string;
  measured_at: string;
  group: BodyKindGroup;
};

export type ReadingRefusal = { name: string; why: "unknown_kind" | "not_a_number" | "switched_off" };

/**
 * Turn what a phone posted into rows Echo can store. Sleep sent in hours is
 * kept in minutes so one calculator covers every source. Nothing is invented:
 * a reading Echo cannot read is refused with a reason.
 */
export function acceptReadings(
  incoming: IncomingReading[],
  consent: Record<string, unknown> | null | undefined,
  now = new Date(),
): { accepted: AcceptedReading[]; refused: ReadingRefusal[] } {
  const accepted: AcceptedReading[] = [];
  const refused: ReadingRefusal[] = [];
  for (const r of incoming) {
    const name = String(r?.kind ?? "").trim();
    const spec = specFor(name);
    if (!spec) {
      refused.push({ name: name || "(no kind)", why: "unknown_kind" });
      continue;
    }
    const value = Number(r?.value);
    if (!Number.isFinite(value)) {
      refused.push({ name: spec.kind, why: "not_a_number" });
      continue;
    }
    if (!groupAllowed(spec.group, consent)) {
      refused.push({ name: spec.kind, why: "switched_off" });
      continue;
    }
    let unit = String(r?.unit ?? "").trim() || spec.unit;
    let stored = value;
    if (spec.kind === "sleep" && /^h(ours?)?$/i.test(unit)) {
      stored = value * 60;
      unit = "min";
    }
    const when = r?.measured_at ? new Date(String(r.measured_at)) : now;
    accepted.push({
      kind: spec.kind,
      value: stored,
      unit: unit.slice(0, 20),
      measured_at: (Number.isFinite(when.getTime()) ? when : now).toISOString(),
      group: spec.group,
    });
  }
  return { accepted, refused };
}

/** One plain sentence about what was refused, for the hand-off's reply. */
export function refusalWords(refused: ReadingRefusal[]): string | null {
  if (!refused.length) return null;
  const unknown = refused.filter((r) => r.why === "unknown_kind").map((r) => r.name);
  const off = refused.filter((r) => r.why === "switched_off").map((r) => r.name);
  const bad = refused.filter((r) => r.why === "not_a_number").length;
  const parts: string[] = [];
  if (unknown.length) parts.push(`Echo has no kind called ${[...new Set(unknown)].join(", ")}`);
  if (off.length) parts.push(`${[...new Set(off)].join(", ")} is switched off in Metro Echo`);
  if (bad) parts.push(`${bad} reading${bad === 1 ? "" : "s"} did not carry a number`);
  return `${parts.join(". ")}.`;
}
