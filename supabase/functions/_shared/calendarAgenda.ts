// calendarAgenda — one readable board of the real calendar, with Echo's read
// laid over it.
//
// Doctrine held here:
//  - Google holds the facts. The events in this board are ingested rows, never
//    invented, never rephrased into something Google did not say.
//  - Overlays (a promise you owe, a change waiting on your yes, a collision)
//    are Echo's interpretation and are always labelled as such, so a person can
//    tell a fact from a read at a glance.
//  - Looking is not staging. Nothing in this file writes, proposes or approves.
import {
  clockLabel,
  dayKey,
  eventsOnDay,
  ongoingAt,
  overlapsOnDay,
  type CalReadEvent,
} from "./calendarRead.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A promise the person owes, as Work already holds it. */
export type AgendaCommitment = { summary: string; due_at: string | null };

/** A calendar change already staged and waiting on a yes. */
export type AgendaPendingChange = {
  title: string;
  /** Provider uid of the event it touches, when Echo resolved one. */
  event_uid?: string | null;
  event_starts_at?: string | null;
};

export type AgendaOverlay = {
  kind: "promise" | "pending_change" | "conflict";
  text: string;
};

export type AgendaInput = {
  events: CalReadEvent[];
  commitments?: AgendaCommitment[];
  pending?: AgendaPendingChange[];
  now?: string;
  tz?: string;
  /** 1 = just this day. 7 = the week ahead. */
  days?: number;
  /** Which day the board starts on. 0 = today, 1 = tomorrow. */
  startOffset?: number;
};

export type AgendaDay = {
  offset: number;
  /** "Today", "Tomorrow", "Friday" — plus the date. */
  heading: string;
  ongoing: string[];
  /** One line per event, in order. */
  lines: { text: string; overlays: AgendaOverlay[] }[];
  /** Overlays that belong to the day but not to one event. */
  dayOverlays: AgendaOverlay[];
};

export type Agenda = { days: AgendaDay[]; text: string; deep: boolean };

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(iso));
  }
}

function heading(offset: number, nowIso: string, tz: string): string {
  const at = new Date(new Date(nowIso).getTime() + offset * DAY).toISOString();
  const date = fmt(at, tz, { month: "short", day: "numeric" });
  const name = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : fmt(at, tz, { weekday: "long" });
  return `${name}, ${date}`;
}

function endOf(e: CalReadEvent): number {
  const s = new Date(e.starts_at).getTime();
  const end = e.ends_at ? new Date(e.ends_at).getTime() : s + HOUR;
  return Number.isFinite(end) ? end : s + HOUR;
}

function eventLine(e: CalReadEvent, tz: string, offset: number, nowIso: string): string {
  const startKey = dayKey(e.starts_at, tz);
  const target = dayKey(new Date(new Date(nowIso).getTime() + offset * DAY).toISOString(), tz);
  const when = e.all_day
    ? "all day"
    : startKey === target
      ? clockLabel(e.starts_at, tz)
      : "carries over";
  const where = e.location ? ` · ${e.location}` : "";
  return `${when} — ${e.title}${where}`;
}

/** Loose title match so a staged change lands on the event it is about. */
function sameish(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function attachPending(
  event: CalReadEvent,
  pending: AgendaPendingChange[],
): AgendaOverlay[] {
  return pending
    .filter((p) =>
      (p.event_uid && event.uid && p.event_uid === event.uid) ||
      (p.event_starts_at && p.event_starts_at === event.starts_at) ||
      sameish(p.title, event.title)
    )
    .map((p) => ({ kind: "pending_change" as const, text: `waiting on your yes — ${p.title}` }));
}

/**
 * Build the board. Days with nothing at all are skipped on a week view and
 * stated plainly on a single-day view, because silence is a real answer.
 */
export function buildAgenda(input: AgendaInput): Agenda {
  const nowIso = input.now ?? new Date().toISOString();
  const tz = input.tz || "UTC";
  const span = Math.max(1, Math.min(14, input.days ?? 1));
  const start = input.startOffset ?? 0;
  const events = input.events ?? [];
  const commitments = input.commitments ?? [];
  const pending = input.pending ?? [];

  const days: AgendaDay[] = [];

  for (let i = 0; i < span; i++) {
    const offset = start + i;
    const dayEvents = eventsOnDay(events, offset, nowIso, tz);
    const target = dayKey(new Date(new Date(nowIso).getTime() + offset * DAY).toISOString(), tz);

    const ongoing = offset === 0
      ? ongoingAt(events, nowIso).map(
        (e) => `${e.title} — running until ${e.all_day ? "end of day" : clockLabel(new Date(endOf(e)).toISOString(), tz)}`,
      )
      : [];

    const lines = dayEvents.map((e) => ({
      text: eventLine(e, tz, offset, nowIso),
      overlays: attachPending(e, pending),
    }));

    const dayOverlays: AgendaOverlay[] = [];
    for (const clash of overlapsOnDay(events, offset, nowIso, tz)) {
      dayOverlays.push({ kind: "conflict", text: clash });
    }
    for (const c of commitments) {
      if (!c.due_at) continue;
      if (dayKey(c.due_at, tz) !== target) continue;
      dayOverlays.push({
        kind: "promise",
        text: `you owe: ${c.summary} (${clockLabel(c.due_at, tz)})`,
      });
    }
    // A staged change that never matched an event still belongs to the day.
    const attached = new Set(lines.flatMap((l) => l.overlays.map((o) => o.text)));
    for (const p of pending) {
      const text = `waiting on your yes — ${p.title}`;
      if (attached.has(text)) continue;
      if (offset !== start) continue;
      dayOverlays.push({ kind: "pending_change", text });
    }

    days.push({ offset, heading: heading(offset, nowIso, tz), ongoing, lines, dayOverlays });
  }

  return { days, text: renderAgenda(days, span), deep: agendaIsDeep(days, span) };
}

function overlayLine(o: AgendaOverlay): string {
  return `   ↳ Echo's read: ${o.text}`;
}

function agendaIsDeep(days: AgendaDay[], span: number): boolean {
  const eventCount = days.reduce((n, d) => n + d.lines.length, 0);
  const overlayCount = days.reduce(
    (n, d) => n + d.dayOverlays.length + d.lines.reduce((m, l) => m + l.overlays.length, 0),
    0,
  );
  return eventCount > 6 || overlayCount > 2 || span > 1;
}

/** Plain text, Telegram-safe: no markdown, no buttons, nothing to tap wrong. */
export function renderAgenda(days: AgendaDay[], span = 1): string {
  const blocks: string[] = [];

  for (const day of days) {
    const empty = day.lines.length === 0 && day.ongoing.length === 0 && day.dayOverlays.length === 0;
    if (empty && span > 1) continue;

    const body: string[] = [];
    for (const on of day.ongoing) body.push(`On now: ${on}`);
    if (day.lines.length === 0 && day.ongoing.length === 0) {
      body.push("Nothing on the calendar.");
    }
    const shown = day.lines.slice(0, span > 1 ? 4 : 8);
    for (const l of shown) {
      body.push(l.text);
      for (const o of l.overlays) body.push(overlayLine(o));
    }
    const hidden = day.lines.length - shown.length;
    if (hidden > 0) body.push(`(+${hidden} more)`);
    for (const o of day.dayOverlays) body.push(overlayLine(o));

    blocks.push(`${day.heading}\n${body.join("\n")}`);
  }

  if (!blocks.length) {
    return span > 1 ? "Nothing on the calendar for the week ahead." : "Nothing on the calendar.";
  }
  return blocks.join("\n\n");
}

/** "day" or "week" from the person's own words. Defaults to the day. */
export function agendaSpanFromWords(phrase: string): { days: number; startOffset: number } {
  const p = String(phrase ?? "").toLowerCase();
  if (/\b(week|next 7|seven days|rest of the week|coming days|next few days)\b/.test(p)) {
    return { days: 7, startOffset: 0 };
  }
  if (/\btomorrow\b/.test(p)) return { days: 1, startOffset: 1 };
  return { days: 1, startOffset: 0 };
}
