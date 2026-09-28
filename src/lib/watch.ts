// watch (client) — how a long-running job talks to a person.
//
// Six words, no jargon, no percentages. Anything the watch would actually
// change still arrives as a draft you approve.
import { supabase } from "@/integrations/supabase/client";

export type WatchState =
  | "on_it"
  | "watching"
  | "waiting"
  | "needs_you"
  | "done"
  | "couldnt_finish"
  | "paused";

export const WATCH_LABEL: Record<WatchState, string> = {
  on_it: "Echo's on it",
  watching: "Watching",
  waiting: "Waiting",
  needs_you: "Needs you",
  done: "Done",
  couldnt_finish: "Couldn't finish",
  paused: "Paused",
};

export const WATCH_TONE: Record<WatchState, string> = {
  on_it: "bg-primary/15 text-primary ring-primary/30",
  watching: "bg-muted/40 text-muted-foreground ring-border/60",
  waiting: "bg-muted/40 text-muted-foreground ring-border/60",
  needs_you: "bg-destructive/15 text-destructive ring-destructive/30",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  couldnt_finish: "bg-warn/15 text-warn ring-warn/30",
  paused: "bg-muted/40 text-muted-foreground ring-border/60",
};

export const OPEN_WATCH_STATES: WatchState[] = ["on_it", "watching", "waiting", "needs_you"];

export type Watch = {
  id: string;
  goal: string;
  kind: "action_settled" | "calendar_event" | "web_page";
  subject_id: string | null;
  state: WatchState;
  last_check_at: string | null;
  next_check_at: string;
  attempts: number;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

/** One line under the state, using recorded checks only. */
export function watchLine(w: Watch): string {
  if (w.outcome) return w.outcome;
  if (w.state === "paused") return "Paused — Echo is not checking this right now.";
  if (!w.last_check_at) return "Nothing checked yet.";
  const checks = w.attempts === 1 ? "one check" : `${w.attempts} checks`;
  return `${checks} so far, nothing has changed.`;
}

/**
 * Every claim about a watch leaves a receipt. A receipt never blocks the act
 * itself — if the log is unreachable the watch still changes state, and the
 * gap is visible in Receipts as silence rather than a false entry.
 */
async function watchReceipt(event: string, watchId: string | null, meta: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("audit_log").insert({
      user_id: data.user.id,
      entity_type: "watch",
      entity_id: watchId,
      event,
      payload: meta,
    });
  } catch { /* the act stands; the receipt is best-effort */ }
}

export async function startWatch(input: {
  userId: string;
  organizationId: string | null;
  goal: string;
  kind: Watch["kind"];
  subjectId: string | null;
  source?: string;
  cadenceMinutes?: number;
  stopAt?: string | null;
  successWhen?: Record<string, unknown>;
}): Promise<void> {
  const { data, error } = await supabase.from("watches").insert({
    user_id: input.userId,
    organization_id: input.organizationId,
    goal: input.goal,
    kind: input.kind,
    subject_id: input.subjectId,
    source: input.source ?? "app",
    cadence_minutes: input.cadenceMinutes ?? 30,
    stop_at: input.stopAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
    success_when: (input.successWhen ?? {}) as never,
  }).select("id").single();
  if (error) throw error;
  await watchReceipt("watch.created", (data as { id: string } | null)?.id ?? null, {
    goal: input.goal, kind: input.kind, source: input.source ?? "app",
  });
}

export async function stopWatch(id: string, goal?: string): Promise<void> {
  const { error } = await supabase
    .from("watches")
    .update({ state: "couldnt_finish", outcome: "You stopped this one.", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await watchReceipt("watch.stopped", id, { goal: goal ?? null });
}

/** Pausing is a state the user can see, never a silent skip. */
export async function pauseWatch(id: string, goal?: string): Promise<void> {
  const { error } = await supabase
    .from("watches")
    .update({ state: "paused", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await watchReceipt("watch.paused", id, { goal: goal ?? null });
}

export async function resumeWatch(id: string, goal?: string): Promise<void> {
  const { error } = await supabase
    .from("watches")
    .update({
      state: "watching",
      next_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  await watchReceipt("watch.resumed", id, { goal: goal ?? null });
}
