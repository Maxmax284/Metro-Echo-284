/**
 * Commitment lifecycle — Slice 7.
 *
 * Mirrors intakeLifecycle.ts but for the `commitments` table. Plain-English
 * states layered on top of the raw rows; nothing here mutates anything.
 *
 * States:
 *   active   — status=open and within the stale window (or not yet overdue)
 *   stale    — status=open AND overdue by more than `commitment_stale_days`
 *   done     — status = done
 *   dropped  — status = cancelled
 *
 * Rule for the Today card: only `active` overdue items shout. `stale` items
 * fall into the Stale tray on the Commitments surface — visible, recoverable,
 * just not screaming.
 */

export type CommitmentLifecycleState = "active" | "stale" | "done" | "dropped";

export type CommitmentRow = {
  id: string;
  status: string;
  due_at: string | null;
  updated_at?: string | null;
};

export function isOpenCommitment(c: Pick<CommitmentRow, "status">): boolean {
  return c.status === "open";
}

export function classifyCommitment(
  c: CommitmentRow,
  staleDays: number,
  now: Date = new Date(),
): CommitmentLifecycleState {
  if (c.status === "done") return "done";
  if (c.status === "cancelled") return "dropped";
  if (!isOpenCommitment(c)) return "dropped";
  if (!c.due_at) return "active";

  // Stale = due date is more than `staleDays` in the past. We deliberately
  // ignore `updated_at` here: a row getting re-saved by a background job or
  // an audit write does NOT count as the user attending to the commitment.
  // Only explicit user actions (snooze, reopen, edit due date) push the due
  // date forward, which is the right signal.
  const due = new Date(c.due_at).getTime();
  const cutoff = now.getTime() - staleDays * 86_400_000;
  return due < cutoff ? "stale" : "active";
}

export function isStaleCommitment(
  c: CommitmentRow,
  staleDays: number,
  now: Date = new Date(),
): boolean {
  return classifyCommitment(c, staleDays, now) === "stale";
}
