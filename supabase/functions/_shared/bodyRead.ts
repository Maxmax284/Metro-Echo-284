// bodyRead — how your body is holding up, from recorded readings only.
//
// Doctrine:
//   - Reports what a watch recorded. It never infers a condition, never advises,
//     never diagnoses.
//   - Silence is a valid read: no readings means it says so instead of guessing.
//   - Read-only, scope-bound like every other read.
type SupabaseClient = { from: (table: string) => any };
import { dosesOn, nextDose, type Medication } from "./bodyLog.ts";
import { bodySenseAnswer, type SenseReading } from "./bodySense.ts";

/**
 * The same readings, compared with this person's own earlier days. Observation
 * only — the shared pure module owns every word of the comparison.
 */
export async function bodyCompare(
  sb: SupabaseClient,
  { userId, orgId }: { userId: string; orgId: string | null },
  { recentDays = 3, usualDays = 14 }: { recentDays?: number; usualDays?: number } = {},
): Promise<string> {
  const span = recentDays + usualDays;
  const since = new Date(Date.now() - span * 86_400_000).toISOString();
  const { data } = await scoped(
    sb.from("wearable_readings").select("kind, value, measured_at"),
    userId,
    orgId,
  )
    .gte("measured_at", since)
    .order("measured_at", { ascending: false })
    .limit(2000);
  return bodySenseAnswer((data ?? []) as SenseReading[], { recentDays, usualDays });
}

export type Reading = { kind: string; value: number; unit: string | null; measured_at: string };

const LABEL: Record<string, string> = {
  heart_rate: "resting heart rate",
  hr: "heart rate",
  hrv: "heart-rate variability",
  steps: "steps",
  sleep_minutes: "sleep",
  sleep: "sleep",
  spo2: "blood oxygen",
  temperature: "skin temperature",
  weight: "weight",
  stress: "stress score",
  bp_systolic: "blood pressure (upper)",
  bp_diastolic: "blood pressure (lower)",
  pulse: "pulse",
};

function scoped(q: any, userId: string, orgId: string | null) {
  const u = q.eq("user_id", userId);
  return orgId ? u.eq("organization_id", orgId) : u.is("organization_id", null);
}

/** Newest reading per kind inside the window. */
export function latestPerKind(rows: Reading[]): Reading[] {
  const best = new Map<string, Reading>();
  for (const r of rows) {
    const prev = best.get(r.kind);
    if (!prev || new Date(r.measured_at) > new Date(prev.measured_at)) best.set(r.kind, r);
  }
  return [...best.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

export function readingLine(r: Reading): string {
  const label = LABEL[r.kind] ?? r.kind.replace(/_/g, " ");
  if (r.kind === "sleep_minutes" || r.kind === "sleep") {
    const h = Math.floor(r.value / 60);
    const m = Math.round(r.value % 60);
    return `${label} ${h}h ${String(m).padStart(2, "0")}m`;
  }
  const unit = r.unit ? ` ${r.unit}` : "";
  return `${label} ${Number(r.value)}${unit}`;
}

export function formatBody(rows: Reading[], days: number): string {
  const latest = latestPerKind(rows);
  if (latest.length === 0) {
    return `No readings from a watch in the last ${days} days, so there is nothing here to report.`;
  }
  const when = latest
    .map((r) => new Date(r.measured_at).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const ago = Math.round((Date.now() - when) / 3_600_000);
  const stamp = ago < 1 ? "just now" : ago < 48 ? `${ago}h ago` : `${Math.round(ago / 24)} days ago`;
  return `${latest.map(readingLine).join(", ")}. Last reading ${stamp}. Recorded numbers only — not a health opinion.`;
}

export async function bodyRead(
  sb: SupabaseClient,
  { userId, orgId }: { userId: string; orgId: string | null },
  { days = 7 }: { days?: number } = {},
): Promise<string> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await scoped(
    sb.from("wearable_readings").select("kind, value, unit, measured_at"),
    userId,
    orgId,
  )
    .gte("measured_at", since)
    .order("measured_at", { ascending: false })
    .limit(200);
  const body = formatBody((data ?? []) as Reading[], days);

  // Medication is a recorded course, so the doses due today can be said plainly.
  // Echo reminds; it never records a dose as taken on the person's behalf.
  const { data: medRows } = await scoped(
    sb.from("medications").select("id, name, dose, times_local, rhythm, starts_on, ends_on, active"),
    userId,
    orgId,
  ).eq("active", true);
  const meds = (medRows ?? []) as Medication[];
  if (meds.length === 0) return body;
  const today = dosesOn(meds, new Date());
  const next = nextDose(meds, new Date());
  if (today.length === 0) return body;
  const line = today.map((d) => `${d.med.name}${d.med.dose ? ` ${d.med.dose}` : ""} at ${d.time}`).join(", ");
  const upcoming = next ? ` Next due at ${next.time}.` : " Nothing further due today.";
  return `${body} Medication today: ${line}.${upcoming} Marking a dose taken stays with you.`;
}
