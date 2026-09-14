// dayWords — keeps a saved note honest after midnight.
//
// Echo writes a heads-up the evening before: "'ADHD appointment' is on tomorrow
// at 4:00 PM." The words were true when they were written. Once the day flips,
// "tomorrow" is a lie the card keeps telling.
//
// Rather than rewriting stored rows (the record stays as recorded), we re-read
// the day word at render time. The reference day comes from when the note was
// written plus whatever the word said — nothing is invented, and if we cannot
// work out a day we leave the sentence exactly as it is.

/** Local calendar day (YYYY-MM-DD) in a given zone, never the browser's. */
function localDay(at: number | string, timezone: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function dayDiff(fromKey: string, toKey: string): number | null {
  if (!fromKey || !toKey) return null;
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function weekdayName(dayKey: string, timezone: string): string | null {
  const t = Date.parse(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(t));
  } catch {
    return null;
  }
}

/** How a day should be spoken about, measured from now. */
export function dayWordFor(offsetFromToday: number, dayKey: string, timezone: string): string | null {
  if (offsetFromToday === 0) return "today";
  if (offsetFromToday === 1) return "tomorrow";
  if (offsetFromToday === -1) return "yesterday";
  if (offsetFromToday > 1 && offsetFromToday <= 6) {
    const name = weekdayName(dayKey, timezone);
    return name ? `on ${name}` : null;
  }
  return null;
}

const WORD = /\b(today|tomorrow)\b/gi;

function matchCase(sample: string, word: string): string {
  if (sample[0] === sample[0]?.toUpperCase() && sample.slice(1) === sample.slice(1).toLowerCase()) {
    return word[0].toUpperCase() + word.slice(1);
  }
  return word;
}

/**
 * Re-read "today"/"tomorrow" in a saved sentence against the clock right now.
 * Returns the text untouched when nothing needs changing, when the zone or the
 * write time is unusable, or when the referenced day is too far off to name.
 */
export function freshenDayWords(opts: {
  text: string | null | undefined;
  createdAt: string | null | undefined;
  timezone: string;
  now?: number;
}): string {
  const text = opts.text ?? "";
  if (!text || !opts.createdAt) return text;
  const now = opts.now ?? Date.now();
  const tz = opts.timezone || "UTC";
  const writtenKey = localDay(opts.createdAt, tz);
  const nowKey = localDay(now, tz);
  if (!writtenKey || !nowKey || writtenKey === nowKey) return text;

  return text.replace(WORD, (m) => {
    const referenced = m.toLowerCase() === "tomorrow" ? 1 : 0;
    const refKey = shiftDay(writtenKey, referenced);
    const offset = dayDiff(nowKey, refKey);
    if (offset === null) return m;
    const word = dayWordFor(offset, refKey, tz);
    return word ? matchCase(m, word) : m;
  });
}

function shiftDay(dayKey: string, days: number): string {
  const t = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(t)) return dayKey;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}
