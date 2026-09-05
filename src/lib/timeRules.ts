import { formatInTimeZone } from "date-fns-tz";

/**
 * Echo time-rules helpers. Pure, no I/O. Used by ReminderComposer + intent
 * handlers to apply the "don't guess recklessly" rules.
 */

export type TimeParse =
  | { kind: "specific"; hh: number; mm: number; ampmKnown: boolean }
  | { kind: "vague"; bucket: "morning" | "afternoon" | "evening" | "later" | "tonight" | "weekend" }
  | { kind: "none" };

const VAGUE_WORDS: { re: RegExp; bucket: Extract<TimeParse, { kind: "vague" }>["bucket"] }[] = [
  { re: /\btonight\b/i, bucket: "tonight" },
  { re: /\b(this )?evening\b/i, bucket: "evening" },
  { re: /\b(this )?afternoon\b/i, bucket: "afternoon" },
  { re: /\b(tomorrow )?morning\b/i, bucket: "morning" },
  { re: /\blater\b/i, bucket: "later" },
  { re: /\b(this )?weekend\b/i, bucket: "weekend" },
];

/** Parse free-text time hint. Returns the most specific match found. */
export function parseTimeHint(input: string): TimeParse {
  const txt = (input || "").trim();
  if (!txt) return { kind: "none" };

  // "5pm", "5 pm", "17:30", "9 AM", "at 5"
  const re = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;
  const m = txt.match(re);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3]?.toLowerCase().replace(/\./g, "");
    const ampmKnown = !!ap || hh > 12 || (m[2] !== undefined && hh !== 0 && hh > 12);
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      return { kind: "specific", hh, mm, ampmKnown };
    }
  }

  for (const v of VAGUE_WORDS) if (v.re.test(txt)) return { kind: "vague", bucket: v.bucket };
  return { kind: "none" };
}

/** Build a Date for "today/tomorrow at HH:MM" in the given timezone. */
export function buildLocalDate(
  baseDate: Date,
  hh: number,
  mm: number,
  timezone: string,
  rollForwardIfPast = true,
): Date {
  // Construct as if user typed HH:MM today in their tz. We approximate by
  // formatting the date in tz, swapping the time, then parsing back.
  const yyyy = formatInTimeZone(baseDate, timezone, "yyyy-MM-dd");
  // Offset-aware ISO string in the user's TZ for that wall-clock time.
  const offset = formatInTimeZone(baseDate, timezone, "xxx"); // e.g. "+07:00"
  const iso = `${yyyy}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${offset}`;
  let d = new Date(iso);
  if (rollForwardIfPast && d.getTime() <= Date.now()) {
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  return d;
}

/** Convert vague bucket → default HH:MM using user preferences. */
export function vagueToTime(
  bucket: Extract<TimeParse, { kind: "vague" }>["bucket"],
  prefs: { default_morning_time: string; default_afternoon_time: string; default_evening_time: string },
): { hh: number; mm: number } | null {
  const pick = (s: string) => {
    const [hh, mm] = s.split(":").map((x) => parseInt(x, 10));
    return { hh, mm };
  };
  switch (bucket) {
    case "morning": return pick(prefs.default_morning_time);
    case "afternoon": return pick(prefs.default_afternoon_time);
    case "evening":
    case "tonight": return pick(prefs.default_evening_time);
    case "later": return null;
    case "weekend": return pick(prefs.default_morning_time);
  }
}

export function formatWhen(d: Date, timezone: string): string {
  return formatInTimeZone(d, timezone, "h:mm a 'on' MMM d");
}

export function formatTzLine(d: Date, timezone: string): string {
  return `${formatInTimeZone(d, timezone, "h:mm a")} ${timezone}`;
}
