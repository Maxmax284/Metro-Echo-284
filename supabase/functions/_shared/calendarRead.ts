// calendarRead — the ONE read of calendar truth every surface answers from.
//
// Doctrine: iCal being read-only means Echo cannot WRITE a calendar. It never
// meant Echo cannot READ one. Telegram, Ask and the widget all answer calendar
// questions from this file, so a person never hits "Ask can see this but
// Telegram can't".
//
// Nothing here writes, guesses, or invents a count. Every line comes off rows
// that were already ingested. Times render in the user's own timezone.

export type CalReadEvent = {
  feed_id: string | null;
  uid: string | null;
  starts_at: string;
  ends_at: string | null;
  title: string;
  location?: string | null;
  all_day?: boolean | null;
};

/**
 * The same appointment can arrive twice — signed in to Google AND subscribed by
 * link. One entry per title-and-window, so no read ever says it twice.
 */
export function dedupeEvents(events: CalReadEvent[]): CalReadEvent[] {
  const seen = new Set<string>();
  return (events ?? []).filter((e) => {
    const who = e.uid ? `uid:${e.uid}` : (e.title ?? "").trim().toLowerCase();
    const key = `${who}|${e.starts_at}|${e.ends_at ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CalendarReadKind = "now" | "day" | "conflicts" | "after" | "week";

export type CalendarQuery = {
  kind: CalendarReadKind;
  /** Days from today. 0 = today, 1 = tomorrow. */
  dayOffset: number;
  /** Week reads only: 0 = the 7 days from today, 1 = the week after. */
  weekOffset?: number;
  /** The user's own words for an event, when they asked about one. */
  reference: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HOUR = 60 * 60 * 1000;

/** Does this read like a question about the calendar, not a capture? */
export function isCalendarReadQuestion(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  if (!/\b(calendar|schedule|agenda|diary|meeting|meetings|appointment|appointments|event|events|booked|on today|my day)\b/.test(t)) {
    return false;
  }
  return /\b(what|what's|whats|when|anything|any|do i|have i|show|list|conflict|conflicts|clash|free|next|after|before)\b/.test(t)
    || t.trim().endsWith("?");
}

/** Turn a question into which read to run. Never guesses at an event. */
export function parseCalendarQuestion(phrase: string, opts?: { now?: Date }): CalendarQuery {
  const p = String(phrase ?? "").toLowerCase();
  const now = opts?.now ?? new Date();
  const reference = null;

  if (/\b(conflict\w*|clash\w*|overlap\w*|double.?book\w*)\b/.test(p)) {
    return { kind: "conflicts", dayOffset: /\btomorrow\b/.test(p) ? 1 : 0, reference };
  }
  if (/\b(after|following|comes next after|then what)\b/.test(p) && /\b(my|the)\b/.test(p)) {
    return { kind: "after", dayOffset: 0, reference: phrase };
  }
  if (/\btomorrow\b/.test(p)) return { kind: "day", dayOffset: 1, reference };
  if (/\bnext week\b/.test(p)) return { kind: "week", dayOffset: 0, weekOffset: 1, reference };
  /* A week is a week — never collapse it into today. */
  if (/\b(rest of the week|this week|my week|week ahead|coming week|next few days|coming days|next 7 days|week look)\b/.test(p)) {
    return { kind: "week", dayOffset: 0, weekOffset: 0, reference };
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(p)) {
      const delta = (i - now.getUTCDay() + 7) % 7 || 7;
      return { kind: "day", dayOffset: delta, reference };
    }
  }
  if (/\b(right now|now|currently|at the moment|next)\b/.test(p)) return { kind: "now", dayOffset: 0, reference };
  return { kind: "day", dayOffset: 0, reference };
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(iso));
  }
}

/** "3:00 PM" in the user's own timezone. */
export function clockLabel(iso: string, tz: string): string {
  return fmt(iso, tz, { hour: "numeric", minute: "2-digit" });
}

/** "2026-09-11" in the user's own timezone, for same-day comparison. */
export function dayKey(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

export function dayLabel(offset: number, nowIso: string, tz: string): string {
  if (offset === 0) return "today";
  if (offset === 1) return "tomorrow";
  const at = new Date(new Date(nowIso).getTime() + offset * 24 * HOUR).toISOString();
  return fmt(at, tz, { weekday: "long" });
}

function endOf(event: CalReadEvent): number {
  const s = new Date(event.starts_at).getTime();
  const e = event.ends_at ? new Date(event.ends_at).getTime() : s + HOUR;
  return Number.isFinite(e) ? e : s + HOUR;
}

/** Anything already running at this instant — the "still true" read. */
export function ongoingAt(events: CalReadEvent[], nowIso: string): CalReadEvent[] {
  const at = new Date(nowIso).getTime();
  return events.filter((e) => {
    const s = new Date(e.starts_at).getTime();
    return Number.isFinite(s) && s <= at && endOf(e) > at;
  });
}

export function upcomingFrom(events: CalReadEvent[], nowIso: string, limit = 5): CalReadEvent[] {
  const at = new Date(nowIso).getTime();
  return events
    .filter((e) => new Date(e.starts_at).getTime() > at)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}

export function eventsOnDay(events: CalReadEvent[], offset: number, nowIso: string, tz: string): CalReadEvent[] {
  const target = dayKey(new Date(new Date(nowIso).getTime() + offset * 24 * HOUR).toISOString(), tz);
  return events
    .filter((e) => {
      // A multi-day stay counts on every day it spans, not only its first.
      const startKey = dayKey(e.starts_at, tz);
      if (startKey === target) return true;
      const endKey = dayKey(new Date(endOf(e)).toISOString(), tz);
      return startKey < target && target <= endKey;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Real overlaps on one day, as plain lines. Each pair is reported once.
 *
 * A hotel stay is not a clash with everything inside it, and neither is an
 * all-day marker — anything that covers the whole day is background, not a
 * collision, so it never accuses the appointments happening during it.
 */
export function overlapsOnDay(events: CalReadEvent[], offset: number, nowIso: string, tz: string): string[] {
  const day = eventsOnDay(events, offset, nowIso, tz).filter((e) => !isBackground(e, tz));
  const lines: string[] = [];
  for (let i = 0; i < day.length; i++) {
    for (let j = i + 1; j < day.length; j++) {
      const a = day[i];
      const b = day[j];
      if (new Date(a.starts_at).getTime() < endOf(b) && endOf(a) > new Date(b.starts_at).getTime()) {
        lines.push(`${a.title} (${clockLabel(a.starts_at, tz)}) overlaps ${b.title} (${clockLabel(b.starts_at, tz)})`);
      }
    }
  }
  return lines;
}

/** All-day, or spanning more than one calendar day: background, not a clash. */
function isBackground(event: CalReadEvent, tz: string): boolean {
  if (event.all_day) return true;
  return dayKey(event.starts_at, tz) !== dayKey(new Date(endOf(event)).toISOString(), tz);
}

/** The next event that starts after a given one ends. */
export function eventAfter(events: CalReadEvent[], event: CalReadEvent): CalReadEvent | null {
  const from = endOf(event);
  const later = events
    .filter((e) => e !== event && new Date(e.starts_at).getTime() >= from)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return later[0] ?? null;
}

function line(event: CalReadEvent, tz: string): string {
  const when = event.all_day ? "all day" : clockLabel(event.starts_at, tz);
  const where = event.location ? ` · ${event.location}` : "";
  return `- ${event.title}, ${when}${where}`;
}

/** Cap a list the way every other Telegram read does: five lines, then a count. */
function capped(items: string[], max = 5): { text: string; truncated: boolean } {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return { text: rest > 0 ? `${shown.join("\n")}\n(+${rest} more)` : shown.join("\n"), truncated: rest > 0 };
}

export type CalendarAnswer = {
  text: string;
  /** True when a screen genuinely helps: a long day, several conflicts. */
  deep: boolean;
};

/** The one answer builder. Same words on every surface. */
export function answerCalendarQuestion(
  query: CalendarQuery,
  rawEvents: CalReadEvent[],
  ctx: { now?: string; tz?: string },
): CalendarAnswer {
  const nowIso = ctx.now ?? new Date().toISOString();
  const tz = ctx.tz || "UTC";
  // One appointment, one line — two feeds carrying the same event say it once.
  const events = dedupeEvents(rawEvents);

  if (query.kind === "conflicts") {
    const when = dayLabel(query.dayOffset, nowIso, tz);
    const overlaps = overlapsOnDay(events, query.dayOffset, nowIso, tz);
    if (!overlaps.length) return { text: `Nothing collides ${when}.`, deep: false };
    const { text, truncated } = capped(overlaps.map((o) => `- ${o}`), 3);
    return { text: `${overlaps.length === 1 ? "One clash" : `${overlaps.length} clashes`} ${when}:\n${text}`, deep: truncated || overlaps.length > 2 };
  }

  if (query.kind === "now") {
    const running = ongoingAt(events, nowIso);
    const next = upcomingFrom(events, nowIso, 2);
    if (!running.length && !next.length) return { text: "Nothing on your calendar right now, and nothing else queued.", deep: false };
    const parts: string[] = [];
    if (running.length) parts.push(`On now: ${running.map((e) => e.title).join(", ")}.`);
    else parts.push("Nothing running right now.");
    if (next.length) {
      const n = next[0];
      const sameDay = dayKey(n.starts_at, tz) === dayKey(nowIso, tz);
      parts.push(`Next: ${n.title}, ${clockLabel(n.starts_at, tz)}${sameDay ? "" : ` on ${fmt(n.starts_at, tz, { weekday: "long" })}`}.`);
    } else {
      parts.push("Nothing after it today.");
    }
    return { text: parts.join(" "), deep: false };
  }

  if (query.kind === "after") {
    return { text: "Which event should I look past?", deep: false };
  }

  /* The week read: one line per event across the days that carry something.
     Empty days are counted, not itemized — open space gets named in the tail,
     the same shape the depth rules ask the model for. A multi-day stay shows
     once, on its first day in the window, not on every day it spans. */
  if (query.kind === "week") {
    const startOffset = (query.weekOffset ?? 0) * 7;
    const span = 7;
    const seen = new Set<string>();
    const lines: string[] = [];
    let daysWithEvents = 0;
    for (let o = startOffset; o < startOffset + span; o++) {
      const day = eventsOnDay(events, o, nowIso, tz);
      const fresh = day.filter((e) => {
        const key = `${e.uid ?? e.title}|${e.starts_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) continue;
      daysWithEvents += 1;
      const at = new Date(new Date(nowIso).getTime() + o * 24 * HOUR).toISOString();
      const dayName = startOffset === 0 && o === 0
        ? "Today"
        : startOffset === 0 && o === 1
          ? "Tomorrow"
          : fmt(at, tz, { weekday: "short", month: "short", day: "numeric" });
      for (const e of fresh) {
        const when = e.all_day ? "all day" : clockLabel(e.starts_at, tz);
        lines.push(`- ${dayName}, ${when}: ${e.title}${e.location ? ` @ ${e.location}` : ""}`);
      }
    }
    const label = startOffset === 0 ? "Your week" : "Next week";
    if (!lines.length) return { text: `${label} is clear — nothing on the record for those 7 days.`, deep: false };
    const { text, truncated } = capped(lines, 12);
    const clearDays = span - daysWithEvents;
    const tail = clearDays > 0 ? `\n${clearDays} of the 7 days are clear.` : "";
    return { text: `${label}:\n${text}${tail}`, deep: truncated };
  }

  const when = dayLabel(query.dayOffset, nowIso, tz);
  const day = eventsOnDay(events, query.dayOffset, nowIso, tz);
  if (!day.length) return { text: `Nothing on your calendar ${when}.`, deep: false };
  const { text, truncated } = capped(day.map((e) => line(e, tz)));
  return { text: `${when === "today" ? "Today" : when[0].toUpperCase() + when.slice(1)}:\n${text}`, deep: truncated };
}

/** "What comes after my doctor appointment?" once the event is resolved. */
export function answerAfterEvent(
  event: CalReadEvent,
  events: CalReadEvent[],
  ctx: { tz?: string },
): CalendarAnswer {
  const tz = ctx.tz || "UTC";
  const next = eventAfter(events, event);
  if (!next) return { text: `Nothing after ${event.title}.`, deep: false };
  const gapMs = new Date(next.starts_at).getTime() - endOf(event);
  const gap = gapMs <= 0 ? "back to back" : gapMs < HOUR ? `${Math.round(gapMs / 60000)} min after` : `${Math.round((gapMs / HOUR) * 10) / 10} h after`;
  return { text: `After ${event.title}: ${next.title}, ${clockLabel(next.starts_at, tz)} — ${gap}.`, deep: false };
}

/** Compact block for a model's context, so Ask reads the same rows Telegram does. */
export function calendarContextBlock(rawEvents: CalReadEvent[], ctx: { now?: string; tz?: string; days?: number }): string {
  const nowIso = ctx.now ?? new Date().toISOString();
  const tz = ctx.tz || "UTC";
  const events = dedupeEvents(rawEvents);
  if (!events.length) return "";
  const running = ongoingAt(events, nowIso);
  /* With a day window, hold every event inside it (a week read needs the whole
     week, not the next eight rows); without one, keep the old next-eight shape. */
  const at = new Date(nowIso).getTime();
  const next = ctx.days
    ? events
        .filter((e) => {
          const s = new Date(e.starts_at).getTime();
          return s > at && s <= at + (ctx.days as number) * 24 * HOUR;
        })
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 40)
    : upcomingFrom(events, nowIso, 8);
  const lines: string[] = [];
  for (const e of running) lines.push(`- ON NOW: ${e.title} (until ${clockLabel(new Date(endOf(e)).toISOString(), tz)})`);
  for (const e of next) lines.push(`- ${fmt(e.starts_at, tz, { weekday: "short", month: "short", day: "numeric" })} ${clockLabel(e.starts_at, tz)}: ${e.title}${e.location ? ` @ ${e.location}` : ""}`);
  return `Calendar rows Echo holds (real ingested events${ctx.days ? ` covering the next ${ctx.days} days` : ""}, timezone ${tz}). Answer calendar questions from these and nothing else; if it is not here, say you do not see it:\n${lines.join("\n")}`;
}
