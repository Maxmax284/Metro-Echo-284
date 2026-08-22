// Calendar sense — Chapter 1, first bridge.
//
// The calendar is a FACT source, nothing more. It normalizes what the day looks
// like into AwarenessSignals and stops there: no scoring, no channel choice, no
// writes. Judgment stays central (relevance → urgency → suppression → delivery).
//
// Two things a calendar genuinely knows that Vanta cannot guess:
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
  // Only worth saying while the collision can still be moved.
  if (due - now > 2 * 24 * 60 * MIN / 60) { /* keeps the 48h horizon readable */ }
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
