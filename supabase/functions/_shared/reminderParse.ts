// Shared reminder parser (Deno). Pure, no I/O.
// Companion + Telegram + cron consume this. Inputs are free-form time hints
// from the model's `set_reminder.when` argument plus the user's stored
// timezone + default morning/afternoon/evening times.

export type Defaults = {
  timezone: string;            // IANA, never empty
  morning: string;             // "HH:MM"
  afternoon: string;
  evening: string;
};

export type ParseResult =
  | { status: "ok"; due_at: string; remind_at: string; timezone: string; phrasing: string }
  | { status: "needs_time"; reason?: string }
  | { status: "needs_ampm"; hh: number; mm: number }
  | { status: "needs_tz" };

function pad(n: number) { return String(n).padStart(2, "0"); }

/** Build a UTC Date for "wall clock HH:MM on yyyy-mm-dd in tz". */
function wallClockInTz(yyyy: number, mo: number, dd: number, hh: number, mm: number, tz: string): Date {
  // Compute the UTC instant whose representation in `tz` is the requested wall clock.
  // Iterative: start from naive UTC, measure the offset of that instant in tz, adjust.
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

function todayPartsInTz(tz: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const s = fmt.format(new Date()); // "yyyy-mm-dd"
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

const VAGUE = [
  { re: /\btonight\b/i, key: "evening" as const, label: "tonight" },
  { re: /\b(this\s+)?evening\b/i, key: "evening" as const, label: "this evening" },
  { re: /\b(this\s+)?afternoon\b/i, key: "afternoon" as const, label: "this afternoon" },
  { re: /\b(tomorrow\s+)?morning\b/i, key: "morning" as const, label: "morning" },
  { re: /\bnoon\b/i, key: "noon" as const, label: "noon" },
  { re: /\bmidnight\b/i, key: "midnight" as const, label: "midnight" },
];

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Parse a free-form reminder time hint.
 * Returns either a fully-resolved due_at/remind_at (UTC ISO) or a status the
 * caller should bounce back to the user.
 */
export function parseReminderHint(input: string, d: Defaults): ParseResult {
  const txt = (input || "").trim();
  if (!txt) return { status: "needs_time", reason: "empty" };
  if (!d.timezone) return { status: "needs_tz" };

  // ISO timestamp passthrough
  const isoMatch = txt.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (isoMatch) {
    const dt = new Date(txt);
    if (!isNaN(dt.getTime())) {
      const iso = dt.toISOString();
      return { status: "ok", due_at: iso, remind_at: iso, timezone: d.timezone, phrasing: dt.toISOString() };
    }
  }

  // "in N minutes/hours/days"
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

  // Determine day offset: today / tomorrow / weekday / "next weekday" / "this weekend"
  let dayOffset = 0;
  let dayPhrase = "today";
  let explicitDate: { y: number; m: number; d: number } | null = null;

  const today = todayPartsInTz(d.timezone);
  const ordinal = txt.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?this\s+month\b/i);
  if (ordinal) {
    const day = Number(ordinal[1]);
    if (day >= 1 && day <= 31) {
      explicitDate = { ...today, d: day };
      dayPhrase = `${today.m}/${day}`;
    }
  }
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const namedDate = txt.match(new RegExp(`\\b(${monthNames.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  if (namedDate) {
    const month = monthNames.indexOf(namedDate[1].toLowerCase()) + 1;
    const day = Number(namedDate[2]);
    if (month > 0 && day >= 1 && day <= 31) {
      explicitDate = { y: today.y, m: month, d: day };
      dayPhrase = `${month}/${day}`;
    }
  }

  if (!explicitDate && /\btomorrow\b/i.test(txt)) { dayOffset = 1; dayPhrase = "tomorrow"; }
  else if (!explicitDate && /\b(this\s+)?weekend\b/i.test(txt)) {
    // next saturday from today
    const { y, m, d: dd } = todayPartsInTz(d.timezone);
    const todayIdx = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    dayOffset = (6 - todayIdx + 7) % 7 || 7;
    dayPhrase = "this weekend";
  } else if (!explicitDate) {
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

  // Specific time: "5pm", "5:30pm", "17:00", "at 5"
  const timeText = txt
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?this\s+month\b/gi, "")
    .replace(new RegExp(`\\b(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), "");
  const tm = timeText.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)(?=\s|$|[,.!?])/i)
    ?? timeText.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\b/i);
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

  // Vague buckets → use defaults
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
        if (v.label === "morning" && /tomorrow/i.test(txt)) { /* already offset */ }
        break;
      }
    }
  }

  if (hh === null) return { status: "needs_time" };

  // AM/PM ambiguity (e.g. "at 5") — only ambiguous if no am/pm marker, no minutes,
  // hour is 1..11 and no clear 24h indicator.
  if (!ampmKnown && hh >= 1 && hh <= 11) {
    return { status: "needs_ampm", hh, mm };
  }

  const tz = d.timezone;
  const { y, m, d: dd } = explicitDate ?? todayPartsInTz(tz);
  let due = wallClockInTz(y, m, explicitDate ? dd : dd + dayOffset, hh, mm, tz);
  // If "today" + time already passed, roll to tomorrow (unless user gave an explicit relative anchor)
  if (!explicitDate && dayOffset === 0 && due.getTime() <= Date.now()) {
    due = wallClockInTz(y, m, dd + 1, hh, mm, tz);
    dayPhrase = "tomorrow";
  }

  const iso = due.toISOString();
  const phrasing = `${dayPhrase} at ${pad(hh > 12 ? hh - 12 : hh === 0 ? 12 : hh)}:${pad(mm)} ${hh >= 12 ? "PM" : "AM"} ${tz}`;
  return { status: "ok", due_at: iso, remind_at: iso, timezone: tz, phrasing };
}

/**
 * A nudge and an appointment are not the same object. If the sentence names
 * another person or a place, the user almost certainly wants it on the
 * calendar, not only in Echo's own reminder list.
 */
export function looksLikeAppointment(text: string): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;
  const withPeople = /\b(with|and)\s+[a-z]{2,}\b/.test(t) || /\b(meet|meeting|meet up|meetup|call with|coffee with|lunch with|dinner with|appointment|appt|interview|viewing|showing)\b/.test(t);
  const withPlace = /\b(at|@)\s+[a-z0-9]/.test(t) && !/\b(at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(t);
  return withPeople || withPlace;
}
