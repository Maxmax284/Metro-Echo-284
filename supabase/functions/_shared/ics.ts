// Minimal, dependency-free iCalendar reader.
//
// Echo only needs to know WHEN something is and WHAT it is called. This parser
// deliberately does less than a full RFC 5545 implementation:
//   - VEVENT only. No todos, journals, alarms, free/busy.
//   - Single occurrences plus simple DAILY/WEEKLY recurrence inside the window.
//     Anything more exotic is skipped rather than guessed at.
//   - Cancelled events are dropped.
//
// Pure module: no IO, no Deno APIs, so the tests can run it directly.

export type IcsEvent = {
  uid: string;
  title: string | null;
  location: string | null;
  /** ISO UTC. */
  startsAt: string;
  /** ISO UTC. Null when the feed gave no end. */
  endsAt: string | null
  allDay: boolean;
};

const DAY_MS = 86_400_000;

/** Unfold RFC 5545 continuation lines (a leading space or tab continues). */
export function unfoldIcs(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

type Prop = { name: string; params: Record<string, string>; value: string };

function parseProp(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Parse a DTSTART/DTEND value. Floating local times are read as UTC — honest
 * within an hour or two, and Echo never claims more precision than the feed
 * gave it. Named-zone conversion is deliberately out of scope here.
 */
export function parseIcsDate(value: string, params: Record<string, string> = {}): { ms: number; allDay: boolean } | null {
  const v = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
}

/** Recurrence we are willing to expand. Everything else is left alone. */
function simpleRepeat(rrule: string): { stepMs: number; count: number | null; untilMs: number | null } | null {
  const parts: Record<string, string> = {};
  for (const bit of rrule.split(";")) {
    const eq = bit.indexOf("=");
    if (eq > 0) parts[bit.slice(0, eq).toUpperCase()] = bit.slice(eq + 1);
  }
  const freq = (parts.FREQ ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY") return null;
  if (parts.BYDAY || parts.BYMONTHDAY || parts.BYMONTH || parts.BYSETPOS) return null;
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const stepMs = (freq === "DAILY" ? DAY_MS : 7 * DAY_MS) * interval;
  const count = parts.COUNT ? Number(parts.COUNT) || null : null;
  const until = parts.UNTIL ? parseIcsDate(parts.UNTIL) : null;
  return { stepMs, count, untilMs: until?.ms ?? null };
}

export type IcsWindow = {
  /** Inclusive lower bound, ms. */
  fromMs: number;
  /** Exclusive upper bound, ms. */
  toMs: number;
};

/**
 * Read a feed into events that fall inside the window. Anything unparseable is
 * skipped silently — a bad line must never take out a whole calendar.
 */
export function parseIcs(text: string, window: IcsWindow): IcsEvent[] {
  const lines = unfoldIcs(text);
  const out: IcsEvent[] = [];
  let cur: Record<string, Prop> | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (t === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (t === "END:VEVENT") {
      if (cur) out.push(...eventsFrom(cur, window));
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseProp(t);
    if (p) cur[p.name] = p;
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function eventsFrom(props: Record<string, Prop>, window: IcsWindow): IcsEvent[] {
  if ((props.STATUS?.value ?? "").toUpperCase() === "CANCELLED") return [];
  const dtstart = props.DTSTART ? parseIcsDate(props.DTSTART.value, props.DTSTART.params) : null;
  if (!dtstart) return [];
  const dtend = props.DTEND ? parseIcsDate(props.DTEND.value, props.DTEND.params) : null;
  const durationMs = dtend ? Math.max(0, dtend.ms - dtstart.ms) : dtstart.allDay ? DAY_MS : 0;

  const uid = (props.UID?.value ?? "").trim() || `${dtstart.ms}`;
  const title = props.SUMMARY ? unescapeText(props.SUMMARY.value) || null : null;
  const location = props.LOCATION ? unescapeText(props.LOCATION.value) || null : null;

  const make = (startMs: number): IcsEvent => ({
    uid,
    title,
    location,
    startsAt: new Date(startMs).toISOString(),
    endsAt: durationMs > 0 ? new Date(startMs + durationMs).toISOString() : null,
    allDay: dtstart.allDay,
  });

  const rule = props.RRULE ? simpleRepeat(props.RRULE.value) : null;
  if (!rule) {
    return startMs_inWindow(dtstart.ms, window) ? [make(dtstart.ms)] : [];
  }

  const events: IcsEvent[] = [];
  let startMs = dtstart.ms;
  let n = 0;
  // Hard cap: a runaway rule must never spin the function.
  while (startMs < window.toMs && n < 500) {
    if (rule.count != null && n >= rule.count) break;
    if (rule.untilMs != null && startMs > rule.untilMs) break;
    if (startMs_inWindow(startMs, window)) events.push(make(startMs));
    startMs += rule.stepMs;
    n++;
  }
  return events;
}

function startMs_inWindow(ms: number, w: IcsWindow): boolean {
  return ms >= w.fromMs && ms < w.toMs;
}

/** webcal:// is just https:// wearing a hat. */
export function normalizeCalendarUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const swapped = trimmed.replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\//i.test(swapped)) return null;
  return swapped;
}
