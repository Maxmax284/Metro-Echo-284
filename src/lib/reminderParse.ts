// Client-side reminder parser. Mirror of supabase/functions/_shared/reminderParse.ts.
// Kept duplicate (rather than shared import) because Vite cannot import from
// the supabase/functions tree. Behavior must stay in sync.

export type Defaults = {
  timezone: string;
  morning: string;
  afternoon: string;
  evening: string;
};

export type ParseResult =
  | { status: "ok"; due_at: string; remind_at: string; timezone: string; phrasing: string }
  | { status: "needs_time"; reason?: string }
  | { status: "needs_ampm"; hh: number; mm: number }
  | { status: "needs_tz" };

const pad = (n: number) => String(n).padStart(2, "0");

function wallClockInTz(yyyy: number, mo: number, dd: number, hh: number, mm: number, tz: string): Date {
  const tryDate = new Date(Date.UTC(yyyy, mo - 1, dd, hh, mm, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(tryDate);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const observedUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"), 0);
  const wantedUtcMs = Date.UTC(yyyy, mo - 1, dd, hh, mm, 0);
  const offset = observedUtcMs - tryDate.getTime();
  return new Date(wantedUtcMs - offset);
}

function todayPartsInTz(tz: string) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

const VAGUE: { re: RegExp; key: "morning" | "afternoon" | "evening" | "noon" | "midnight"; label: string }[] = [
  { re: /\btonight\b/i, key: "evening", label: "tonight" },
  { re: /\b(this\s+)?evening\b/i, key: "evening", label: "this evening" },
  { re: /\b(this\s+)?afternoon\b/i, key: "afternoon", label: "this afternoon" },
  { re: /\b(tomorrow\s+)?morning\b/i, key: "morning", label: "morning" },
  { re: /\bnoon\b/i, key: "noon", label: "noon" },
  { re: /\bmidnight\b/i, key: "midnight", label: "midnight" },
];

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parseReminderHint(input: string, d: Defaults): ParseResult {
  const txt = (input || "").trim();
  if (!txt) return { status: "needs_time", reason: "empty" };
  if (!d.timezone) return { status: "needs_tz" };

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(txt)) {
    const dt = new Date(txt);
    if (!isNaN(dt.getTime())) {
      const iso = dt.toISOString();
      return { status: "ok", due_at: iso, remind_at: iso, timezone: d.timezone, phrasing: dt.toISOString() };
    }
  }

  const rel = txt.match(/\bin\s+(?:a|an|(\d+))\s*(min(?:ute)?s?|hr|hours?|h|day|days|d)\b/i);
  if (rel) {
    const n = rel[1] ? parseInt(rel[1], 10) : 1;
    const unit = rel[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith("min")) ms = n * 60_000;
    else if (unit.startsWith("h")) ms = n * 3_600_000;
    else if (unit.startsWith("d")) ms = n * 86_400_000;
    const dt = new Date(Date.now() + ms);
    const phrasing = unit.startsWith("min") ? `${n} minute${n === 1 ? "" : "s"}`
                  : unit.startsWith("h")   ? `${n} hour${n === 1 ? "" : "s"}`
                  : `${n} day${n === 1 ? "" : "s"}`;
    return { status: "ok", due_at: dt.toISOString(), remind_at: dt.toISOString(), timezone: d.timezone, phrasing: `in ${phrasing}` };
  }

  let dayOffset = 0;
  let dayPhrase = "today";

  if (/\btomorrow\b/i.test(txt)) { dayOffset = 1; dayPhrase = "tomorrow"; }
  else if (/\b(this\s+)?weekend\b/i.test(txt)) {
    const { y, m, d: dd } = todayPartsInTz(d.timezone);
    const todayIdx = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    dayOffset = (6 - todayIdx + 7) % 7 || 7;
    dayPhrase = "this weekend";
  } else {
    for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
      const re = new RegExp(`\\b(on\\s+|next\\s+)?${WEEKDAY_NAMES[i]}\\b`, "i");
      if (re.test(txt)) {
        const { y, m, d: dd } = todayPartsInTz(d.timezone);
        const todayIdx = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
        let diff = (i - todayIdx + 7) % 7;
        if (diff === 0 || /next/i.test(txt)) diff = diff || 7;
        dayOffset = diff;
        dayPhrase = WEEKDAY_NAMES[i];
        break;
      }
    }
  }

  const tm = txt.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i);
  let hh: number | null = null;
  let mm = 0;
  let ampmKnown = false;

  if (tm) {
    let h = parseInt(tm[1], 10);
    const m = tm[2] ? parseInt(tm[2], 10) : 0;
    const ap = tm[3]?.toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      hh = h; mm = m;
      ampmKnown = !!ap || h > 12 || (tm[2] !== undefined);
    }
  }

  if (hh === null) {
    for (const v of VAGUE) {
      if (v.re.test(txt)) {
        let raw: string;
        if (v.key === "noon") raw = "12:00";
        else if (v.key === "midnight") raw = "00:00";
        else raw = (d as any)[v.key] ?? "09:00";
        const [vh, vm] = raw.split(":").map((x) => parseInt(x, 10));
        hh = vh; mm = vm; ampmKnown = true;
        dayPhrase = v.label;
        break;
      }
    }
  }

  if (hh === null) return { status: "needs_time" };
  if (!ampmKnown && hh >= 1 && hh <= 11) return { status: "needs_ampm", hh, mm };

  const tz = d.timezone;
  const { y, m, d: dd } = todayPartsInTz(tz);
  let due = wallClockInTz(y, m, dd + dayOffset, hh, mm, tz);
  if (dayOffset === 0 && due.getTime() <= Date.now()) {
    due = wallClockInTz(y, m, dd + 1, hh, mm, tz);
    dayPhrase = "tomorrow";
  }

  const iso = due.toISOString();
  const display = `${pad(hh > 12 ? hh - 12 : hh === 0 ? 12 : hh)}:${pad(mm)} ${hh >= 12 ? "PM" : "AM"}`;
  return { status: "ok", due_at: iso, remind_at: iso, timezone: tz, phrasing: `${dayPhrase} at ${display} ${tz}` };
}
