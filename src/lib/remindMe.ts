// remindMe — the person's own voice, outranking Echo's judgement.
//
// Echo stays quiet about boring entries on purpose, and when Google keeps the
// day-of alarm Echo drops its same-day note. Both of those are inference. This
// is not: when someone says "keep an eye on this", that entry speaks either
// way, evening and day-of, boring title or not.
//
// It is the same watch object the rest of the platform already uses
// (kind calendar_event, subject = the feed's own uid), because the reminder
// engine already reads those as explicit intent. No second reminder system.
import { supabase } from "@/integrations/supabase/client";
import { OPEN_WATCH_STATES } from "@/lib/watch";

/** The appointment's own identity, not the feed row's. Matches eventKey(). */
export function watchSubjectFor(event: { id: string; uid?: string | null }): string {
  return (event.uid ?? "").trim() || event.id;
}

/** Six words, plain, so the watch list reads like a sentence. */
export function remindGoal(title: string | null | undefined): string {
  const name = (title ?? "").trim() || "this entry";
  return `Remind me about ${name}`.slice(0, 160);
}

/**
 * Stop watching a day after it happens. A reminder for something already past
 * is noise, and an unbounded watch is a leak.
 */
export function remindStopAt(startsAt: string): string {
  const start = new Date(startsAt).getTime();
  const base = Number.isFinite(start) ? start : Date.now();
  return new Date(base + 86_400_000).toISOString();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * subject_id is a real database key, and a subscribed feed's uid is not one
 * ("abc123@google.com"). Identity therefore lives in success_when.uid — where
 * the sweeper already reads it — and subject_id only carries a row we own.
 */
export function remindSubjectRow(subject: string): string | null {
  return UUID.test(subject) ? subject : null;
}

/** Which of these appointments the person has already asked about. */
export async function loadRemindedSubjects(subjectIds: string[]): Promise<Set<string>> {
  const ids = subjectIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("watches")
    .select("subject_id, success_when")
    .eq("kind", "calendar_event")
    .in("state", OPEN_WATCH_STATES)
    .limit(200);
  const wanted = new Set(ids);
  const open = new Set<string>();
  for (const r of (data ?? []) as { subject_id: string | null; success_when: { uid?: string } | null }[]) {
    const key = (r.success_when?.uid ?? "").trim() || r.subject_id || "";
    if (key && wanted.has(key)) open.add(key);
  }
  return open;
}

export async function startReminder(input: {
  userId: string;
  organizationId: string | null;
  event: { id: string; uid?: string | null; title: string | null; starts_at: string };
}): Promise<void> {
  const subject = watchSubjectFor(input.event);
  const { error } = await supabase.from("watches").insert({
    user_id: input.userId,
    organization_id: input.organizationId,
    goal: remindGoal(input.event.title),
    kind: "calendar_event",
    subject_id: remindSubjectRow(subject),
    source: "asked",
    /* The reminder engine decides when to speak; the watch just says "this one counts". */
    cadence_minutes: 180,
    stop_at: remindStopAt(input.event.starts_at),
    success_when: { uid: subject } as never,
  });
  if (error) throw error;
}

/** Taking it back is closing the watch, never deleting the receipt. */
export async function stopReminder(subjectId: string): Promise<void> {
  const { data } = await supabase
    .from("watches")
    .select("id, subject_id, success_when")
    .eq("kind", "calendar_event")
    .in("state", OPEN_WATCH_STATES)
    .limit(200);
  const ids = ((data ?? []) as { id: string; subject_id: string | null; success_when: { uid?: string } | null }[])
    .filter((r) => ((r.success_when?.uid ?? "").trim() || r.subject_id || "") === subjectId)
    .map((r) => r.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("watches")
    .update({ state: "done", outcome: "You asked Echo to stop watching this one." })
    .in("id", ids);
  if (error) throw error;
}
