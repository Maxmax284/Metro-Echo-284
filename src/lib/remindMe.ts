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

/** Which of these appointments the person has already asked about. */
export async function loadRemindedSubjects(subjectIds: string[]): Promise<Set<string>> {
  const ids = subjectIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("watches")
    .select("subject_id")
    .eq("kind", "calendar_event")
    .in("state", OPEN_WATCH_STATES)
    .in("subject_id", ids.slice(0, 200));
  return new Set(((data ?? []) as { subject_id: string | null }[]).map((r) => r.subject_id ?? ""));
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
    subject_id: subject,
    source: "asked",
    /* The reminder engine decides when to speak; the watch just says "this one counts". */
    cadence_minutes: 180,
    stop_at: remindStopAt(input.event.starts_at),
    success_when: {} as never,
  });
  if (error) throw error;
}

/** Taking it back is closing the watch, never deleting the receipt. */
export async function stopReminder(subjectId: string): Promise<void> {
  const { error } = await supabase
    .from("watches")
    .update({ state: "done", outcome: "You asked Echo to stop watching this one." })
    .eq("kind", "calendar_event")
    .eq("subject_id", subjectId)
    .in("state", OPEN_WATCH_STATES);
  if (error) throw error;
}
