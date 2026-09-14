// weekPlan — the pure arithmetic behind planning a week.
//
// Doctrine:
//   - A week is Monday-first. Sunday-first reads wrong for a working week.
//   - Grouping happens on the person's own local day, never on a UTC boundary.
//   - A day summary reads like a person talking, and says nothing when the day
//     holds nothing. Silence is a valid read.

export const DAY_MS = 86_400_000;

/** Monday 00:00 of the week containing `d`, in local time. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const back = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

/** Sunday 23:59:59.999 of the same week. */
export function endOfWeek(start: Date): Date {
  const out = new Date(start);
  out.setDate(out.getDate() + 6);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function shiftWeeks(start: Date, weeks: number): Date {
  const out = new Date(start);
  out.setDate(out.getDate() + weeks * 7);
  return startOfWeek(out);
}

/** The seven dates of the week, in order. */
export function weekDates(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Stable local-day key. Two things on the same local day share it. */
export function dayKeyLocal(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  return dayKeyLocal(a) === dayKeyLocal(b);
}

/** "This week" when it holds today, otherwise the span in words. */
export function weekHeading(start: Date, now = new Date()): string {
  const end = endOfWeek(start);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const holdsToday = now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
  const span = `${fmt(start)} – ${fmt(end)}`;
  return holdsToday ? `This week · ${span}` : span;
}

export type DayLoad = { appointments: number; promises: number; notes: number };

/**
 * One line that says what the day holds. An empty day says it is empty rather
 * than showing a blank — a plan you cannot read is not a plan.
 */
export function daySummary(load: DayLoad): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (load.appointments) parts.push(plural(load.appointments, "appointment", "appointments"));
  if (load.promises) parts.push(plural(load.promises, "promise", "promises"));
  if (load.notes) parts.push(plural(load.notes, "note", "notes"));
  if (parts.length === 0) return "Nothing on this day.";
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}

/** Group anything carrying an instant into local-day buckets. */
export function bucketByDay<T>(rows: T[], at: (row: T) => string | null): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const iso = at(r);
    if (!iso) continue;
    (out[dayKeyLocal(iso)] ||= []).push(r);
  }
  return out;
}

/** Project names touching a day, once each, in the order they appear. */
export function projectNamesForDay(names: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = (n ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * A promise written off an appointment repeats the appointment's own words. Show
 * it once: the calendar entry carries the hour, so the echo of it is dropped.
 */
export function dropEchoedPromises<T>(
  promises: T[],
  eventTitles: (string | null | undefined)[],
  summary: (row: T) => string,
): T[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.\s]+$/, "");
  const titles = new Set(eventTitles.map((t) => norm(t ?? "")).filter(Boolean));
  if (titles.size === 0) return promises;
  return promises.filter((p) => {
    const s = norm(summary(p));
    if (!s) return true;
    for (const t of titles) if (t === s || t.startsWith(s) || s.startsWith(t)) return false;
    return true;
  });
}
