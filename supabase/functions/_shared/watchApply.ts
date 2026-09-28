// watchApply — the one place a sentence becomes the existing watch row.
//
// Telegram and Ask both land here. There is no watch bot, no second engine and
// no write of any kind to a provider: a watch only ever observes recorded state
// and reports, and anything consequential still goes through the action spine.
import { calendarFingerprint, type WatchKind } from "./watch.ts";
import { resolveEventReference, type ResolvableEvent } from "./calendarResolve.ts";
import {
  inferWatchKind,
  matchOpenWatch,
  watchCadenceMinutes,
  watchGoal,
  watchNeedsSubjectReply,
  watchNothingOpenReply,
  watchStartedReply,
  watchStatusReply,
  watchStopAmbiguousReply,
  watchStopAt,
  watchStoppedReply,
  type OpenWatchShape,
} from "./watchIntent.ts";

/* A deliberately loose client type: both surfaces pass their own instance. */
type Sb = {
  from: (table: string) => any;
};

/* A watch that claims to exist leaves a receipt the moment it does. The
   receipt never blocks the watch itself. */
async function watchReceipt(
  sb: Sb,
  userId: string,
  event: string,
  watchId: string | null,
  meta: Record<string, unknown>,
) {
  try {
    await sb.from("audit_log").insert({
      user_id: userId,
      entity_type: "watch",
      entity_id: watchId,
      event,
      payload: meta,
    });
  } catch { /* the act stands; the receipt is best-effort */ }
}

export type WatchApplyResult = {
  reply: string;
  watchId?: string | null;
  readOnly?: boolean;
};

type EventRow = ResolvableEvent & { id: string };

async function upcomingEvents(sb: Sb, userId: string): Promise<EventRow[]> {
  const from = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data } = await sb
    .from("calendar_events")
    .select("id, feed_id, uid, title, starts_at, ends_at")
    .eq("user_id", userId)
    .gte("starts_at", from)
    .order("starts_at", { ascending: true })
    .limit(120);
  return (data ?? []) as EventRow[];
}

async function recentActions(sb: Sb, userId: string) {
  const { data } = await sb
    .from("actions")
    .select("id, title, status, created_at")
    .eq("user_id", userId)
    .in("status", ["proposed", "staged", "approved"])
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as { id: string; title: string | null; status: string }[];
}

/**
 * One watch per real entry, not per database row. Calendar sync rewrites rows,
 * so the row id is not a stable identity — the feed's own `uid` is. Saying it
 * twice must never start a second watch just because the row was replaced.
 */
async function findOpenCalendarWatch(
  sb: Sb,
  userId: string,
  eventId: string | null,
  uid: string | null,
): Promise<string | null> {
  const { data } = await sb
    .from("watches")
    .select("id, subject_id, success_when")
    .eq("user_id", userId)
    .eq("kind", "calendar_event")
    .in("state", ["on_it", "watching", "waiting", "needs_you"])
    .limit(50);
  const rows = (data ?? []) as { id: string; subject_id: string | null; success_when: Record<string, unknown> | null }[];
  const hit = rows.find(
    (r) =>
      (uid && String(r.success_when?.uid ?? "") === uid) ||
      (!!eventId && r.subject_id === eventId),
  );
  return hit?.id ?? null;
}

/** Already-in-hand entry → one watch row. Used by the in-app affordance. */
export async function startCalendarWatch(
  sb: Sb,
  userId: string,
  organizationId: string | null,
  event: { id: string; title: string | null; starts_at: string; ends_at?: string | null; uid?: string | null; feed_id?: string | null },
  source = "app",
): Promise<WatchApplyResult> {
  const label = event.title?.trim() || "that entry";
  const goal = watchGoal(label, "calendar_event");

  const dup = await findOpenCalendarWatch(sb, userId, event.id, event.uid ?? null);
  if (dup) {
    return { reply: `Already keeping an eye on ${label}.`, watchId: dup, readOnly: true };
  }

  const now = new Date();
  const { data, error } = await sb
    .from("watches")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      goal,
      kind: "calendar_event",
      subject_id: event.id,
      source,
      cadence_minutes: 30,
      next_check_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
      stop_at: watchStopAt(now, ""),
      success_when: {
        fingerprint: calendarFingerprint(event),
        uid: event.uid ?? null,
        feed_id: event.feed_id ?? null,
      },
    })
    .select("id")
    .single();
  if (error || !data) return { reply: "I couldn't start that one. Nothing is being watched.", readOnly: true };
  await watchReceipt(sb, userId, "watch.created", data.id, { goal, kind: "calendar_event", source });
  return { reply: watchStartedReply(goal, 30), watchId: data.id };
}

/** "Keep an eye on this" → one watch row, or one clarifying question. */
export async function startWatchFromWords(
  sb: Sb,
  userId: string,
  organizationId: string | null,
  input: { reference: string; kind?: WatchKind | "unknown"; source?: string },
): Promise<WatchApplyResult> {
  const reference = String(input.reference ?? "").trim();
  const hinted = input.kind && input.kind !== "unknown" ? input.kind : inferWatchKind(reference);

  const now = new Date();
  const cadence = watchCadenceMinutes(reference);
  const stopAt = watchStopAt(now, reference);

  let kind: WatchKind = hinted === "action" ? "action_settled" : "calendar_event";
  let subjectId: string | null = null;
  let successWhen: Record<string, unknown> = {};
  let subjectLabel = reference;

  if (hinted === "action") {
    const actions = await recentActions(sb, userId);
    const words = reference.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const hit = actions.find((a) => words.some((w) => (a.title ?? "").toLowerCase().includes(w))) ?? (actions.length === 1 ? actions[0] : null);
    if (!hit) return { reply: watchNeedsSubjectReply("action"), readOnly: true };
    kind = "action_settled";
    subjectId = hit.id;
    subjectLabel = hit.title ?? reference;
  } else {
    const events = await upcomingEvents(sb, userId);
    const resolved = resolveEventReference(reference, events, { now });
    if (resolved.status === "none") return { reply: watchNeedsSubjectReply("calendar_event"), readOnly: true };
    if (resolved.status === "many") {
      return {
        reply: `Which one? ${resolved.candidates.map((c) => c.title).join(" · ")}`,
        readOnly: true,
      };
    }
    const match = events.find((e) => e.uid === resolved.event.uid && e.starts_at === resolved.event.starts_at);
    if (!match) return { reply: watchNeedsSubjectReply("calendar_event"), readOnly: true };
    kind = "calendar_event";
    subjectId = match.id;
    subjectLabel = match.title;
    successWhen = {
      fingerprint: calendarFingerprint(match),
      uid: match.uid ?? null,
      feed_id: match.feed_id ?? null,
    };
  }

  const goal = watchGoal(subjectLabel, kind);

  /* One watch per thing: saying it twice must not start a second one. */
  if (kind === "calendar_event") {
    const dup = await findOpenCalendarWatch(sb, userId, subjectId, String(successWhen.uid ?? "") || null);
    if (dup) return { reply: `Already on it — ${goal}`, watchId: dup, readOnly: true };
  } else {
    const { data: existing } = await sb
      .from("watches")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("subject_id", subjectId)
      .in("state", ["on_it", "watching", "waiting", "needs_you"])
      .limit(1);
    if (existing && existing.length > 0) {
      return { reply: `Already on it — ${goal}`, watchId: existing[0].id, readOnly: true };
    }
  }

  const { data, error } = await sb
    .from("watches")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      goal,
      kind,
      subject_id: subjectId,
      source: input.source ?? "ask",
      cadence_minutes: cadence,
      next_check_at: new Date(now.getTime() + cadence * 60_000).toISOString(),
      stop_at: stopAt,
      success_when: successWhen,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { reply: "I couldn't start that one. Nothing is being watched.", readOnly: true };
  }
  await watchReceipt(sb, userId, "watch.created", data.id, { goal, kind, source: input.source ?? "ask" });
  return { reply: watchStartedReply(goal, cadence), watchId: data.id };
}

/** "Stop watching that" → the existing watch closes, with a receipt-worthy outcome. */
export async function stopWatchFromWords(
  sb: Sb,
  userId: string,
  input: { reference?: string },
): Promise<WatchApplyResult> {
  const { data } = await sb
    .from("watches")
    .select("id, goal, state, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const match = matchOpenWatch((data ?? []) as OpenWatchShape[], String(input.reference ?? ""));
  if (match.status === "none") return { reply: watchNothingOpenReply(), readOnly: true };
  if (match.status === "many") return { reply: watchStopAmbiguousReply(match.candidates), readOnly: true };

  const { error } = await sb
    .from("watches")
    .update({ state: "couldnt_finish", outcome: "You stopped this one.", updated_at: new Date().toISOString() })
    .eq("id", match.watch.id)
    .eq("user_id", userId);
  if (error) return { reply: "I couldn't stop that one. It's still running.", readOnly: true };
  await watchReceipt(sb, userId, "watch.stopped", match.watch.id, { goal: match.watch.goal });
  return { reply: watchStoppedReply(match.watch.goal), watchId: match.watch.id };
}

/** "What are you watching?" — recorded state only. */
export async function readWatchStatus(sb: Sb, userId: string): Promise<WatchApplyResult> {
  const { data } = await sb
    .from("watches")
    .select("id, goal, state, outcome, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return { reply: watchStatusReply((data ?? []) as OpenWatchShape[]), readOnly: true };
}
