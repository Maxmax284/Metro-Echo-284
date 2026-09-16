// bodyLog — the rules for what a body reading is, said once.
//
// Doctrine:
//   - Echo records numbers. It never reads them as a verdict. No "that's high",
//     no "you should", no diagnosis. A range note may say what the published
//     bands are, and even then it says whose bands they are.
//   - Blood pressure is two numbers and a pulse, not one. It is stored as two
//     rows so nothing has to be unpacked later, and paired back for reading.
//   - A dose is due at a local clock time. Echo says a dose is due; taking it is
//     the person's, and nothing is ever marked taken on their behalf.
//   - Nothing here does IO, so every rule below is testable.

export type BodyKind = "weight" | "temperature" | "bp_systolic" | "bp_diastolic" | "pulse";

export type BodyEntry = {
  kind: string;
  value: number;
  unit: string;
  measured_at: string;
  source?: string;
};

export const BODY_UNITS: Record<BodyKind, string[]> = {
  weight: ["kg", "lb"],
  temperature: ["°C", "°F"],
  bp_systolic: ["mmHg"],
  bp_diastolic: ["mmHg"],
  pulse: ["bpm"],
};

const KIND_WORD: Record<string, string> = {
  weight: "Weight",
  temperature: "Temperature",
  bp_systolic: "Blood pressure",
  bp_diastolic: "Blood pressure",
  pulse: "Pulse",
};

export function kindWord(kind: string): string {
  return KIND_WORD[kind] ?? kind.replace(/_/g, " ");
}

/**
 * "128/82" or "128 / 82 p64" typed in one field, because that is how a cuff
 * shows it. Anything else returns null rather than a half-read number.
 */
export function parseBloodPressure(
  text: string,
): { systolic: number; diastolic: number; pulse: number | null } | null {
  const m = String(text).match(/(\d{2,3})\s*[/\\]\s*(\d{2,3})(?:\s*(?:p|pulse|hr)?\s*(\d{2,3}))?/i);
  if (!m) return null;
  const systolic = Number(m[1]);
  const diastolic = Number(m[2]);
  if (!(systolic > diastolic) || systolic > 300 || diastolic < 20) return null;
  const pulse = m[3] ? Number(m[3]) : null;
  const usable = pulse != null && pulse >= 20 && pulse <= 250 ? pulse : null;
  return { systolic, diastolic, pulse: usable };
}

/** One reading in words, with its own unit and nothing added to it. */
export function readingWords(e: BodyEntry): string {
  const v = Number.isInteger(e.value) ? String(e.value) : e.value.toFixed(1);
  if (e.kind === "temperature") return `${v}${e.unit || "°C"}`;
  return e.unit ? `${v} ${e.unit}` : v;
}

/**
 * The two halves of one cuff reading, paired by the minute they were taken.
 * A lone half is reported as itself; it is never completed with a guess.
 */
export function pairBloodPressure(rows: BodyEntry[]): Array<{ measured_at: string; text: string }> {
  const byMinute = new Map<string, { sys?: number; dia?: number; pulse?: number }>();
  for (const r of rows) {
    const key = r.measured_at.slice(0, 16);
    const slot = byMinute.get(key) ?? {};
    if (r.kind === "bp_systolic") slot.sys = r.value;
    if (r.kind === "bp_diastolic") slot.dia = r.value;
    if (r.kind === "pulse") slot.pulse = r.value;
    byMinute.set(key, slot);
  }
  const out: Array<{ measured_at: string; text: string }> = [];
  for (const [key, slot] of byMinute) {
    if (slot.sys == null && slot.dia == null) continue;
    const head =
      slot.sys != null && slot.dia != null
        ? `${slot.sys}/${slot.dia} mmHg`
        : slot.sys != null
          ? `${slot.sys} mmHg systolic only`
          : `${slot.dia} mmHg diastolic only`;
    out.push({ measured_at: key, text: slot.pulse != null ? `${head}, pulse ${slot.pulse}` : head });
  }
  return out.sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));
}

/** The newest of each kind, so a page shows where things stand, not a wall. */
export function latestByKind(rows: BodyEntry[]): BodyEntry[] {
  const best = new Map<string, BodyEntry>();
  for (const r of rows) {
    const held = best.get(r.kind);
    if (!held || r.measured_at > held.measured_at) best.set(r.kind, r);
  }
  return [...best.values()];
}

/** A trend is a difference between two recorded numbers, never an opinion. */
export function moveWords(rows: BodyEntry[], kind: string): string | null {
  const of = rows
    .filter((r) => r.kind === kind)
    .sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));
  if (of.length < 2) return null;
  const delta = of[0].value - of[1].value;
  if (Math.abs(delta) < 0.05) return "no change from the reading before";
  const size = Math.abs(delta) < 10 ? Math.abs(delta).toFixed(1) : String(Math.round(Math.abs(delta)));
  return `${delta > 0 ? "up" : "down"} ${size} ${of[0].unit} from the reading before`;
}

/** The one line every body surface carries, so no screen can imply a verdict. */
export const BODY_DISCLAIMER = "Recorded numbers only. Echo does not read them as a diagnosis.";

export type Medication = {
  id: string;
  name: string;
  dose: string;
  times_local: string[];
  rhythm: string;
  starts_on?: string | null;
  ends_on?: string | null;
  active: boolean;
};

function minutesOf(hhmm: string): number | null {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** A clock time, cleaned to HH:MM, or null if it was never a time. */
export function cleanTime(input: string): string | null {
  const raw = String(input).trim().replace(/\s+/g, "");
  const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${ampm[2] ?? "00"}`;
  }
  const m = minutesOf(raw);
  if (m == null) return null;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type Dose = { med: Medication; time: string; minutes: number };

/**
 * The doses that fall on one day: only for an active course, only inside its
 * own start and end, and only for a rhythm that actually has clock times.
 */
export function dosesOn(meds: Medication[], day: Date): Dose[] {
  const key = dayKey(day);
  const out: Dose[] = [];
  for (const med of meds) {
    if (!med.active || med.rhythm !== "daily") continue;
    if (med.starts_on && key < med.starts_on) continue;
    if (med.ends_on && key > med.ends_on) continue;
    for (const t of med.times_local) {
      const time = cleanTime(t);
      const minutes = time ? minutesOf(time) : null;
      if (time && minutes != null) out.push({ med, time, minutes });
    }
  }
  return out.sort((a, b) => a.minutes - b.minutes || a.med.name.localeCompare(b.med.name));
}

/** The next dose still ahead on this day, or null when the day's doses are past. */
export function nextDose(meds: Medication[], now: Date): Dose | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  return dosesOn(meds, now).find((d) => d.minutes >= mins) ?? null;
}

/** What a day's medication looks like in one line. Silence when there is none. */
export function doseLine(meds: Medication[], day: Date): string {
  const doses = dosesOn(meds, day);
  if (!doses.length) return "";
  const names = [...new Set(doses.map((d) => d.med.name))];
  const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return `${doses.length} ${doses.length === 1 ? "dose" : "doses"} — ${who}`;
}

/** Every dose is a reminder, never an action. Nothing is taken on your behalf. */
export const DOSE_LAW = "Echo says a dose is due. Marking it taken stays yours.";
