// Appointment reminders — the one place Echo decides an ordinary appointment
// is worth a heads-up before it starts.
//
// Doctrine this file holds:
//   - An event is not a notification. Existence alone never speaks.
//   - Echo speaks about an appointment at most twice: once the evening before,
//     once a few hours out on the day. Never per feed, never per run.
//   - Google's own reminders are Google's. Echo does not mirror them and does
//     not store them; this policy is Echo's own reading of the calendar.
//   - Boring calendar furniture (holds, busy blocks, birthdays, all-day rows)
//     stays silent unless the person explicitly asked to be reminded.
//   - Anything the person explicitly asked Echo to keep an eye on beats the
//     quiet default.
//
// Pure module: no IO, no Deno globals. The sweep fetches rows, calls this, and
// the central pipeline still decides urgency, suppression and delivery.
import type { AwarenessSignal, ScopeIdentity } from "./signal.ts";
import { registerSignalKind } from "./registry.ts";
import type { CalendarEventRow } from "./adapters-calendar.ts";
import { SOON_MINUTES } from "./adapters-calendar.ts";
import type { AppointmentWeather } from "./appointmentWeather.ts";

registerSignalKind({
  kind: "appointment_ahead",
  source: "calendar",
  baseImpact: 0.85,
  label: "An appointment is coming up",
});

export type ReminderClass = "next_day" | "same_day";

export type ReminderEventRow = CalendarEventRow & { uid?: string | null; project_id?: string | null };

const MIN = 60_000;
const DAY_MS = 24 * 60 * MIN;

/** The evening look-ahead window, in the person's own local hours. */
export const EVENING_FROM_HOUR = 17;
export const EVENING_TO_HOUR = 21;
/** How far out a same-day heads-up is still useful rather than premature. */
export const SAME_DAY_MAX_MINUTES = 300;
/** Nothing longer than this is an appointment; it is a block of time. */
export const MAX_APPOINTMENT_HOURS = 8;

/** Calendar furniture: true on the calendar, not worth a word. */
const BORING =
  /\b(busy|blocked?|block|hold|tentative|free|ooo|out of office|pto|vacation|lunch|break|focus|deep work|birthday|anniversary|holiday|placeholder|do not book|no meetings|wfh|commute|sleep)\b/i;

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** Local calendar day (YYYY-MM-DD) in the person's zone, never the browser's. */
export function localDayKey(at: number | string, timezone: string): string {
  const d = new Date(at);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

/** Local hour of day (0..23) in the person's zone. */
export function localHour(at: number | string, timezone: string): number {
  const d = new Date(at);
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hour12: false,
    }).format(d);
    return Number(h) % 24;
  } catch {
    return new Date(d).getUTCHours();
  }
}

/**
 * Does this row look like something a person actually shows up for?
 * Deliberately generous about content and strict about shape: a titled, timed,
 * bounded entry qualifies; furniture does not.
 */
export function isMeaningfulAppointment(e: ReminderEventRow): boolean {
  if (e.all_day) return false;
  const title = (e.title ?? "").trim();
  if (!title) return false;
  if (BORING.test(title)) return false;
  const start = ms(e.starts_at);
  const end = ms(e.ends_at);
  if (!Number.isFinite(start)) return false;
  if (Number.isFinite(end) && end - start > MAX_APPOINTMENT_HOURS * 60 * MIN) return false;
  return true;
}

export type ReminderContext = {
  /** Feed uids the person explicitly asked Echo to watch or remind them about. */
  explicitUids?: Iterable<string>;
  /** Feed uids that already changed and are speaking for a stronger reason. */
  changedUids?: Iterable<string>;
  /**
   * Google already fires its own alarm on the day. When this is on, Echo drops
   * the same-day heads-up and keeps only what Google never says: the evening
   * look-ahead. Anything explicitly watched still speaks either way.
   */
  deferToGoogle?: boolean;
  /**
   * What the sky is doing around one appointment, when a forecast for where the
   * person is was actually recorded. Never invented, never its own note.
   */
  weatherFor?: (event: ReminderEventRow) => AppointmentWeather | null;
  /** The project the entry is filed under, when it is. Recorded names only. */
  projectFor?: (event: ReminderEventRow) => string | null;
};

/** The identity of the appointment itself, not of a feed row. */
export function eventKey(e: ReminderEventRow): string {
  return (e.uid ?? "").trim() || e.id;
}

/**
 * Which heads-up, if any, this appointment has earned right now.
 * Everything is measured in the person's own local day, so "tomorrow" means
 * their tomorrow.
 */
export function reminderClass(
  e: ReminderEventRow,
  now: number,
  timezone: string,
  opts: { explicit?: boolean } = {},
): ReminderClass | null {
  const explicit = opts.explicit === true;
  if (e.all_day) return null;
  if (!explicit && !isMeaningfulAppointment(e)) return null;

  const start = ms(e.starts_at);
  if (!Number.isFinite(start)) return null;

  const minsAway = (start - now) / MIN;
  // Already started, or close enough that "starts soon" owns the moment.
  if (minsAway <= SOON_MINUTES) return null;

  const dayNow = localDayKey(now, timezone);
  const dayEvent = localDayKey(start, timezone);

  if (dayEvent === dayNow) {
    return minsAway <= SAME_DAY_MAX_MINUTES ? "same_day" : null;
  }

  if (dayEvent === localDayKey(now + DAY_MS, timezone)) {
    const hour = localHour(now, timezone);
    if (explicit ? hour >= 7 : hour >= EVENING_FROM_HOUR && hour < EVENING_TO_HOUR) {
      return "next_day";
    }
  }
  return null;
}

function whenWords(startMs: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(startMs));
  } catch {
    return new Date(startMs).toISOString();
  }
}

/**
 * A calendar title people actually write can be a paragraph. The record keeps
 * every word; the sentence Echo speaks takes the first clause, and never more
 * than one line. Nothing is invented — only cut.
 */
export function spokenLabel(raw: string): string {
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) return "An untitled calendar entry";
  const cut = title.search(/[:.!?](\s|$)|\s—\s/);
  const head = cut > 6 ? title.slice(0, cut).trim() : title;
  if (head.length <= 60) return head;
  const words = head.slice(0, 60);
  const space = words.lastIndexOf(" ");
  return `${(space > 20 ? words.slice(0, space) : words).trim()}…`;
}

/** One signal for one appointment. Callers never build these by hand. */
export function reminderToSignal(
  e: ReminderEventRow,
  cls: ReminderClass,
  scope: ScopeIdentity,
  now: number,
  timezone: string,
  opts: { explicit?: boolean; weather?: AppointmentWeather | null; project?: string | null } = {},
): AwarenessSignal {
  const key = eventKey(e);
  const label = (e.title ?? "").trim() || "An untitled calendar entry";
  const where = e.location?.trim();
  const start = ms(e.starts_at);
  const at = whenWords(start, timezone);
  const org = scope.organizationId ?? "personal";

  const weather = opts.weather ?? null;
  /* The sky rides on the sentence the appointment already earned — it never
     becomes a second note. */
  const sky = weather ? ` Expect ${weather.clause}.` : "";
  /* The person's own filing, said in their words. Only ever a name that was
     actually recorded on the entry. */
  const project = (opts.project ?? "").trim();
  const filed = project ? ` Filed under ${project}.` : "";
  const why =
    (cls === "next_day"
      ? `"${label}" is on tomorrow at ${at}${where ? ` — ${where}` : ""}.`
      : `"${label}" is today at ${at}${where ? ` — ${where}` : ""}.`) + sky + filed;


  return {
    id: `appointment_ahead:${key}:${cls}`,
    source: "calendar",
    type: "appointment_ahead",
    scope,
    entityType: "calendar_event",
    entityId: e.id,
    // One appointment, one heads-up per class, no matter how many feeds carry it.
    dedupeKey: `aw:appointment_ahead:${key}:${cls}:${org}`,
    timestamp: new Date(now).toISOString(),
    summary: cls === "next_day" ? "Tomorrow has an appointment in it" : "An appointment is coming up today",
    why,
    nextStep:
      cls === "next_day"
        ? "Nothing to do now — just so it is not a surprise in the morning."
        : "Check what you need with you before you have to move.",
    confidence: opts.explicit ? 0.95 : 0.9,
    resolved: false,
    currentState: { due_at: e.starts_at, title: label },
    sourceRefs: [{ kind: "calendar_event", id: e.id, label }],
    metadata: {
      reminder_class: cls,
      // Same-day is genuinely clock-bound; the evening look-ahead is not.
      clock_bound: cls === "same_day",
      explicit: opts.explicit === true,
      event_key: key,
      location: where ?? null,
      project: project || null,
      starts_at: e.starts_at,
      weather: weather ? { kind: weather.kind, clause: weather.clause, warning: weather.warning, temp_c: weather.tempC } : null,
    },
  };
}

/**
 * Every appointment heads-up this scope has earned, at most one per
 * appointment. Rows that already changed are left to the change signal — Echo
 * does not say the same thing twice from two angles.
 */
export function appointmentReminderSignals(
  events: ReminderEventRow[],
  scope: ScopeIdentity,
  now: number,
  timezone: string,
  ctx: ReminderContext = {},
): AwarenessSignal[] {
  const explicitUids = new Set(ctx.explicitUids ?? []);
  const changedUids = new Set(ctx.changedUids ?? []);
  const deferToGoogle = ctx.deferToGoogle === true;
  const seen = new Set<string>();
  const out: AwarenessSignal[] = [];

  for (const e of events) {
    const key = eventKey(e);
    if (seen.has(key)) continue;
    if (changedUids.has(key)) continue;
    const explicit = explicitUids.has(key);
    const cls = reminderClass(e, now, timezone, { explicit });
    if (!cls) continue;
    // Google owns the day-of alarm unless the person asked Echo for this one.
    if (deferToGoogle && cls === "same_day" && !explicit) continue;
    seen.add(key);
    const weather = ctx.weatherFor ? ctx.weatherFor(e) : null;
    const project = ctx.projectFor ? ctx.projectFor(e) : null;
    out.push(reminderToSignal(e, cls, scope, now, timezone, { explicit, weather, project }));
  }
  return out;
}
