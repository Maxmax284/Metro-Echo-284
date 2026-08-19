// Resolution recheck.
//
// A nudge should die the moment the underlying situation gets handled — not
// linger until a cooldown expires. This module answers one question, purely:
// given a pending nudge and the current state of the thing it points at, is it
// still true?
//
// No writes here. Callers decide what to do with the verdict.

/** Minimal shape of a pending nudge row. */
export type PendingNudge = {
  id: string;
  kind: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  dedupe_key: string | null;
  expires_at?: string | null;
};

/** Current state of the entities a nudge could point at, keyed by id. */
export type EntityState = {
  /** commitments: open | done | cancelled */
  commitments: Record<string, string>;
  /** actions: proposed | staged | approved | executed | ... */
  actions: Record<string, string>;
  /** projects: last updated_at ISO, used for the silent-project detector */
  projects: Record<string, string>;
};

export type ResolutionReason =
  | "commitment_closed"
  | "action_moved_on"
  | "risk_reviewed"
  | "project_active_again"
  | "entity_gone"
  | "expired";

export type ResolutionVerdict =
  | { stillTrue: true }
  | { stillTrue: false; reason: ResolutionReason };

const CLOSED_COMMITMENTS = new Set(["done", "cancelled"]);
/** Anything past staged means the human already touched it. */
const MOVED_ON_ACTIONS = new Set(["approved", "executed", "audited", "rolled_back", "cancelled"]);

const SILENT_PROJECT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Is the situation behind this nudge still true right now?
 *
 * Unknown entities count as gone: if we can no longer see the row inside the
 * nudge's own scope, we do not keep talking about it.
 */
export function recheckNudge(
  nudge: PendingNudge,
  state: EntityState,
  now = Date.now(),
): ResolutionVerdict {
  if (nudge.expires_at && new Date(nudge.expires_at).getTime() <= now) {
    return { stillTrue: false, reason: "expired" };
  }

  const id = nudge.related_entity_id;
  if (!id) return { stillTrue: true };

  switch (nudge.related_entity_type) {
    case "commitment": {
      const status = state.commitments[id];
      if (status === undefined) return { stillTrue: false, reason: "entity_gone" };
      if (CLOSED_COMMITMENTS.has(status)) return { stillTrue: false, reason: "commitment_closed" };
      return { stillTrue: true };
    }
    case "action": {
      const status = state.actions[id];
      if (status === undefined) return { stillTrue: false, reason: "entity_gone" };
      if (MOVED_ON_ACTIONS.has(status)) {
        return {
          stillTrue: false,
          reason: nudge.kind === "risk_unread" ? "risk_reviewed" : "action_moved_on",
        };
      }
      return { stillTrue: true };
    }
    case "project": {
      const updated = state.projects[id];
      if (updated === undefined) return { stillTrue: false, reason: "entity_gone" };
      if (nudge.kind === "project_went_silent" && now - new Date(updated).getTime() < SILENT_PROJECT_MS) {
        return { stillTrue: false, reason: "project_active_again" };
      }
      return { stillTrue: true };
    }
    default:
      return { stillTrue: true };
  }
}

export type Retirement = { id: string; reason: ResolutionReason; dedupeKey: string | null };

/** Which pending nudges have quietly stopped being true. */
export function retireResolved(
  nudges: PendingNudge[],
  state: EntityState,
  now = Date.now(),
): Retirement[] {
  const out: Retirement[] = [];
  for (const n of nudges) {
    const verdict = recheckNudge(n, state, now);
    if (verdict.stillTrue === false) {
      out.push({ id: n.id, reason: verdict.reason, dedupeKey: n.dedupe_key });
    }
  }
  return out;
}
