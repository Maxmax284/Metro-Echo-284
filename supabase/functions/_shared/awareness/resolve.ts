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
  /** documents: current status */
  documents?: Record<string, string>;
  /** capture_routes: the user_action recorded, if any */
  captures?: Record<string, string | null>;
  /** sherlock_findings: current status */
  sherlockFindings?: Record<string, string>;
};

export type ResolutionReason =
  | "commitment_closed"
  | "action_moved_on"
  | "risk_reviewed"
  | "project_active_again"
  | "document_moved_on"
  | "capture_routed"
  | "finding_answered"
  | "entity_gone"
  | "expired";

export type ResolutionVerdict =
  | { stillTrue: true }
  | { stillTrue: false; reason: ResolutionReason };

const CLOSED_COMMITMENTS = new Set(["done", "cancelled"]);
/** Anything past staged means the human already touched it. */
const MOVED_ON_ACTIONS = new Set(["approved", "executed", "audited", "rolled_back", "cancelled"]);

/** Any Sherlock finding out of `pending` has had its answer. */
const ANSWERED_FINDINGS = new Set(["accepted", "dismissed", "acted", "expired", "snoozed"]);

/** A document past these statuses is no longer waiting on the user. */
const SETTLED_DOCUMENTS = new Set(["reviewed", "approved", "failed", "archived", "accepted", "signed", "final", "cancelled"]);

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
    case "document": {
      const status = (state.documents ?? {})[id];
      if (status === undefined) return { stillTrue: false, reason: "entity_gone" };
      if (SETTLED_DOCUMENTS.has(status)) return { stillTrue: false, reason: "document_moved_on" };
      return { stillTrue: true };
    }
    case "sherlock_finding": {
      const status = (state.sherlockFindings ?? {})[id];
      if (status === undefined) return { stillTrue: false, reason: "entity_gone" };
      if (status !== "pending" || ANSWERED_FINDINGS.has(status)) {
        return { stillTrue: false, reason: "finding_answered" };
      }
      return { stillTrue: true };
    }
    case "capture":
    case "note":
    case "file": {
      const captures = state.captures ?? {};
      if (!(id in captures)) return { stillTrue: true };
      if (captures[id]) return { stillTrue: false, reason: "capture_routed" };
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
