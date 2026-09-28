// watch — the long-running "keep going until X happens" object.
//
// Doctrine this file exists to hold:
//   - A watch never writes to anything and never executes. It observes recorded
//     state and reports. Anything consequential still goes through the action
//     spine and your approval.
//   - Silence is a valid outcome. A check that finds no change moves nothing
//     except the next check time.
//   - Every watch can give up. A watch with no stop condition is a leak, so the
//     sweep enforces both an attempt ceiling and a deadline.
//
// Pure module: no IO, no Deno globals, so both the sweep and the tests can use
// it directly.

/** The only states a person ever sees. */
export const WATCH_STATES = [
  "on_it",
  "watching",
  "waiting",
  "needs_you",
  "done",
  "couldnt_finish",
  "paused",
] as const;
export type WatchState = (typeof WATCH_STATES)[number];

export const WATCH_KINDS = ["action_settled", "calendar_event", "web_page"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export const OPEN_STATES: WatchState[] = ["on_it", "watching", "waiting"];

export type WatchRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  goal: string;
  kind: WatchKind;
  subject_id: string | null;
  state: WatchState;
  cadence_minutes: number;
  next_check_at: string;
  attempts: number;
  max_attempts: number;
  stop_at: string | null;
  success_when: Record<string, unknown>;
  outcome: string | null;
};

/** What a single check concluded. `null` outcome means nothing worth saying. */
export type CheckResult = {
  state: WatchState;
  outcome: string | null;
};

export function isOpen(state: WatchState): boolean {
  return OPEN_STATES.includes(state);
}

export function isDue(row: Pick<WatchRow, "state" | "next_check_at">, now: Date): boolean {
  return isOpen(row.state) && new Date(row.next_check_at).getTime() <= now.getTime();
}

/**
 * Gentle backoff so a watch that runs for days does not hammer a source: the
 * cadence doubles every eight checks and is capped at six hours.
 */
export function nextCadenceMinutes(base: number, attempts: number): number {
  const steps = Math.floor(attempts / 8);
  return Math.min(360, Math.max(1, Math.round(base * 2 ** steps)));
}

export function nextCheckAt(base: number, attempts: number, now: Date): string {
  return new Date(now.getTime() + nextCadenceMinutes(base, attempts) * 60_000).toISOString();
}

/**
 * A short hold placed on a watch the moment a sweep picks it up, so two runs
 * that overlap cannot both check the same thing. The hold is only ever a
 * postponement: the real next check time is written when the check finishes.
 */
export const LEASE_MINUTES = 5;

export function leaseUntil(now: Date, minutes: number = LEASE_MINUTES): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** True when this watch has run out of road. */
export function exhausted(row: Pick<WatchRow, "attempts" | "max_attempts" | "stop_at">, now: Date): boolean {
  if (row.attempts >= row.max_attempts) return true;
  return !!row.stop_at && new Date(row.stop_at).getTime() <= now.getTime();
}

/* ------------------------------------------------------------- checkers */

/** An action watch settles when the action itself settles. */
export function settleFromAction(status: string | null | undefined): CheckResult {
  switch (status) {
    case "executed":
    case "audited":
      return { state: "done", outcome: "It went through." };
    case "cancelled":
      return { state: "couldnt_finish", outcome: "It was cancelled, so there was nothing left to wait for." };
    case "rolled_back":
      return { state: "couldnt_finish", outcome: "It was rolled back." };
    case "approved":
      return { state: "watching", outcome: null };
    case "proposed":
    case "staged":
      return { state: "needs_you", outcome: "This is still waiting on your approval." };
    default:
      return { state: "couldnt_finish", outcome: "The thing being watched is no longer there." };
  }
}

export type CalendarShape = {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

/** Minute precision: a feed rewriting seconds is not news. */
function toMinute(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso);
  return new Date(Math.floor(t.getTime() / 60_000) * 60_000).toISOString();
}

/**
 * A stable string for "has this entry changed?". Only the three things a person
 * would call a change count: what it is called, when it starts, when it ends.
 * Descriptions, sync tokens and other feed churn are deliberately ignored.
 */
export function calendarFingerprint(ev: CalendarShape | null): string {
  if (!ev) return "";
  return [(ev.title ?? "").trim().toLowerCase(), toMinute(ev.starts_at), toMinute(ev.ends_at)].join("|");
}

/**
 * A time a person can read, in their own zone. Machine timestamps never reach
 * the glass: the outcome line is the sentence Echo says out loud.
 */
export function humanWhen(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return "an unstated time";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "an unstated time";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || "UTC",
    }).format(t);
  } catch {
    return t.toISOString();
  }
}

export function settleFromCalendar(
  expected: string,
  current: CalendarShape | null,
  timezone?: string | null,
): CheckResult {
  if (!current) return { state: "done", outcome: "That entry is gone from the calendar." };
  const now = calendarFingerprint(current);
  if (!expected || now === expected) return { state: "watching", outcome: null };
  return {
    state: "done",
    outcome: `It moved: ${current.title ?? "the entry"} now runs ${humanWhen(current.starts_at, timezone)}.`,
  };
}
