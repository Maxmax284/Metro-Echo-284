// Calendar sense — Chapter 1, first bridge.
//
// The calendar is a FACT source, nothing more. It normalizes what the day looks
// like into AwarenessSignals and stops there: no scoring, no channel choice, no
// writes. Judgment stays central (relevance → urgency → suppression → delivery).
//
// Two things a calendar genuinely knows that Echo cannot guess:
//   1. Something starts soon and the user may not be looking at Today.
//   2. A promise is due while the user is already booked elsewhere.
//
// Everything else a calendar could say ("your day is busy") is noise and is
// deliberately not a signal.
import type { AwarenessSignal, ScopeIdentity } from "./signal.ts";
import { registerSignalKind } from "./registry.ts";

registerSignalKind({
  kind: "meeting_starting_soon",
  source: "calendar",
  baseImpact: 0.6,
  label: "Something starts soon",
});
registerSignalKind({
  kind: "commitment_collides_with_meeting",
  source: "calendar",
  baseImpact: 0.65,
  label: "A promise lands mid-meeting",
});

export type CalendarEventRow = {
  id: string;
  title: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  feed_id?: string | null;
};

export type CommitmentLike = {
  id: string;
  summary: string;
  due_at: string | null;
  status: string;
};

const MIN = 60_000;
/** The window where "soon" is actionable rather than merely true. */
export const SOON_MINUTES = 45;

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

function timeLabel(startMs: number, now: number): string {
  const mins = Math.round((startMs - now) / MIN);
  if (mins <= 1) return "starts in a minute";
  if (mins < 60) return `starts in ${mins} minutes`;
  const hrs = Math.round(mins / 60);
  return `starts in about ${hrs} ${hrs === 1 ? "hour" : "hours"}`;
}

/**
 * Something on the calendar is about to start. All-day entries never qualify —
 * they have no moment to be late for.
 */
export function calendarEventToSignal(
  e: CalendarEventRow,
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  if (e.all_day) return null;
  const start = ms(e.starts_at);
  if (!Number.isFinite(start)) return null;
  const minsAway = (start - now) / MIN;
  if (minsAway <= 0 || minsAway > SOON_MINUTES) return null;

  const label = e.title?.trim() || "An untitled calendar entry";
  const where = e.location?.trim();
  return {
    id: `meeting_starting_soon:${e.id}`,
    source: "calendar",
    type: "meeting_starting_soon",
    scope,
    entityType: "calendar_event",
    entityId: e.id,
    timestamp: new Date(now).toISOString(),
    summary: "Something starts soon",
    why: `"${label}" ${timeLabel(start, now)}${where ? ` — ${where}` : ""}.`,
    nextStep: "Close out what you are holding, or move the entry on purpose.",
    confidence: 0.95,
    resolved: false,
    // due_at is what the central clock reads for time sensitivity.
    currentState: { due_at: e.starts_at, title: label },
    sourceRefs: [{ kind: "calendar_event", id: e.id, label }],
    metadata: { minutes_away: Math.round(minsAway), location: where ?? null, all_day: false },
  };
}

/**
 * A commitment falls inside a booked block. This is the calendar earning its
 * keep: the promise is not late yet, but the day says it will be.
 */
export function commitmentCollisionToSignal(
  c: CommitmentLike,
  events: CalendarEventRow[],
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  if (c.status !== "open") return null;
  const due = ms(c.due_at);
  if (!Number.isFinite(due) || due <= now) return null;
  // Only worth saying inside a 48h horizon, while it can still be moved.
  if (due - now > 48 * 60 * MIN) return null;

  const clash = events.find((e) => {
    if (e.all_day) return false;
    const s = ms(e.starts_at);
    const end = Number.isFinite(ms(e.ends_at)) ? ms(e.ends_at) : s + 60 * MIN;
    return Number.isFinite(s) && due >= s && due < end;
  });
  if (!clash) return null;

  const meeting = clash.title?.trim() || "a calendar entry";
  const promise = c.summary?.trim() || "An open promise";
  return {
    id: `commitment_collides_with_meeting:${c.id}:${clash.id}`,
    source: "calendar",
    type: "commitment_collides_with_meeting",
    scope,
    entityType: "commitment",
    entityId: c.id,
    timestamp: new Date(now).toISOString(),
    summary: "A promise lands while you are booked",
    why: `"${promise}" is due during ${meeting}.`,
    nextStep: "Move the promise or the meeting before the day forces the choice.",
    confidence: 0.85,
    resolved: false,
    currentState: { due_at: c.due_at, meeting },
    sourceRefs: [
      { kind: "commitment", id: c.id, label: promise },
      { kind: "calendar_event", id: clash.id, label: meeting },
    ],
    metadata: { meeting_id: clash.id, meeting_title: meeting, due_at: c.due_at },
  };
}

/** Every calendar signal for one scope, in one call. */
export function calendarSignals(
  events: CalendarEventRow[],
  commitments: CommitmentLike[],
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal[] {
  const out: AwarenessSignal[] = [];
  for (const e of events) {
    const s = calendarEventToSignal(e, scope, now);
    if (s) out.push(s);
  }
  for (const c of commitments) {
    const s = commitmentCollisionToSignal(c, events, scope, now);
    if (s) out.push(s);
  }
  return out;
}

registerSignalKind({
  kind: "meeting_changed",
  source: "calendar",
  baseImpact: 0.7,
  label: "Something you planned around changed",
});

export type CalendarChangeRow = {
  id: string;
  title: string | null;
  change: string;
  old_starts_at: string | null;
  new_starts_at: string | null;
  was_filed: boolean;
  detected_at: string;
};

/** How near the change is, said in words rather than a timestamp. */
function nearLabel(iso: string | null, now: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const hrs = (t - now) / (60 * MIN);
  if (hrs < 0) return "already past";
  if (hrs < 3) return "in the next few hours";
  if (hrs < 24) return "later today";
  if (hrs < 48) return "tomorrow";
  return "later this week";
}

function whenWords(iso: string | null): string {
  if (!iso) return "an unknown time";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "an unknown time";
  return d.toUTCString().replace(/:\d\d GMT$/, " UTC");
}

/**
 * A meeting the user planned around moved or came off the calendar.
 *
 * This is the only calendar change worth interrupting for. Additions are only
 * news when they land inside the next day, because that is the only case where
 * something appeared in time the user already considered spent.
 */
export function calendarChangeToSignal(
  c: CalendarChangeRow,
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  const at = c.change === "cancelled" ? c.old_starts_at : c.new_starts_at;
  const startMs = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(startMs)) return null;

  // Nothing to do about a change to a slot that has already passed.
  if (c.change !== "cancelled" && startMs < now) return null;

  if (c.change === "added") {
    const hrs = (startMs - now) / (60 * MIN);
    if (hrs > 24) return null;
  }

  const label = c.title?.trim() || "An untitled calendar entry";
  const near = nearLabel(at, now);

  const why =
    c.change === "cancelled"
      ? `"${label}" is off the calendar — it was ${near || "on the day"}. That time is yours again.`
      : c.change === "moved"
        ? `"${label}" moved to ${whenWords(c.new_starts_at)}${near ? ` — ${near}` : ""}.`
        : `"${label}" appeared on your calendar ${near || "soon"}.`;

  const nextStep =
    c.change === "cancelled"
      ? "Decide what that freed slot is for before something else takes it."
      : "Check what you had promised around that slot still fits.";

  return {
    id: `meeting_changed:${c.id}`,
    source: "calendar",
    type: "meeting_changed",
    scope,
    entityType: "calendar_event",
    entityId: c.id,
    timestamp: new Date(now).toISOString(),
    summary:
      c.change === "cancelled"
        ? "Something came off your calendar"
        : c.change === "moved"
          ? "Something on your calendar moved"
          : "Something new landed on your calendar",
    why,
    nextStep,
    // Filed entries are ones the user attached to a project by hand, so the
    // change is known to matter rather than merely suspected to.
    confidence: c.was_filed ? 0.95 : 0.8,
    resolved: false,
    currentState: { due_at: at, change: c.change, title: label },
    sourceRefs: [{ kind: "calendar_event", id: c.id, label }],
    metadata: {
      change: c.change,
      old_starts_at: c.old_starts_at,
      new_starts_at: c.new_starts_at,
      was_filed: c.was_filed,
    },
  };
}

/** Every worthwhile change from one sync pass, in one call. */
export function calendarChangeSignals(
  changes: CalendarChangeRow[],
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal[] {
  const out: AwarenessSignal[] = [];
  for (const c of changes) {
    const s = calendarChangeToSignal(c, scope, now);
    if (s) out.push(s);
  }
  return out;
}
