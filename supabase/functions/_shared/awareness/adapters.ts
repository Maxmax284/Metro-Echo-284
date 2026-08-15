// The first adapters — existing Vanta data only.
//
// The drift detectors already decide *what* is drifting. These turn their
// output, plus the plain commitment/action/security rows we already read, into
// normalized AwarenessSignals. No new data sources, no speculative stubs for
// future telemetry: the SignalAdapter seam in signal.ts is the contract those
// will implement later.
import type { AwarenessSignal, ScopeIdentity, SignalKind } from "./signal.ts";
import type { DriftSignal } from "../drift.ts";

const DRIFT_TYPE: Record<DriftSignal["kind"], SignalKind> = {
  project_went_silent: "project_went_silent",
  commitment_drifting: "commitment_drifting",
  risk_unread: "risk_unread",
};

/** Drift detector output -> normalized signal. */
export function driftToSignal(
  d: DriftSignal,
  scope: ScopeIdentity,
  now: number,
  extras: {
    projectId?: string;
    projectLabel?: string;
    confidence?: number;
    resolved?: boolean;
    previousState?: unknown;
    currentState?: unknown;
  } = {},
): AwarenessSignal {
  return {
    id: `${d.kind}:${d.related_entity_id}`,
    source: "drift",
    type: DRIFT_TYPE[d.kind],
    scope,
    entityType: d.related_entity_type,
    entityId: d.related_entity_id,
    projectId: extras.projectId,
    projectLabel: extras.projectLabel,
    timestamp: new Date(now).toISOString(),
    summary: d.title,
    why: d.reason,
    nextStep: d.next_step,
    confidence: extras.confidence ?? 0.7,
    resolved: extras.resolved ?? false,
    previousState: extras.previousState,
    currentState: extras.currentState,
    sourceRefs: [{ kind: d.related_entity_type, id: d.related_entity_id }],
    metadata: { detector: d.kind, dedupe_hint: d.dedupe_key },
  };
}

export type CommitmentRow = {
  id: string;
  summary: string;
  due_at: string | null;
  status: string;
  updated_at?: string | null;
};

/** Commitments due soon or already past, straight from real rows. */
export function commitmentToSignal(
  c: CommitmentRow,
  scope: ScopeIdentity,
  now: number,
  extras: { projectId?: string; projectLabel?: string } = {},
): AwarenessSignal | null {
  if (c.status !== "open" || !c.due_at) return null;
  const due = new Date(c.due_at).getTime();
  if (!Number.isFinite(due)) return null;
  const hours = (due - now) / (60 * 60 * 1000);
  if (hours > 48) return null;

  const overdue = hours < 0;
  return {
    id: `${overdue ? "commitment_overdue" : "commitment_due_soon"}:${c.id}`,
    source: "commitments",
    type: overdue ? "commitment_overdue" : "commitment_due_soon",
    scope,
    entityType: "commitment",
    entityId: c.id,
    projectId: extras.projectId,
    projectLabel: extras.projectLabel,
    timestamp: new Date(now).toISOString(),
    summary: overdue ? "A promise is past its date" : "Due soon",
    why: overdue
      ? `"${c.summary}" was due ${Math.abs(Math.round(hours))}h ago and is still open.`
      : `"${c.summary}" is due in ${Math.max(1, Math.round(hours))}h.`,
    nextStep: "Open it and either make the move or reset the date honestly.",
    confidence: 1,
    resolved: false,
    currentState: { status: c.status, due_at: c.due_at },
    sourceRefs: [{ kind: "commitment", id: c.id, label: c.summary }],
  };
}

export type ActionRow = {
  id: string;
  title: string;
  risk: string;
  status: string;
  created_at: string;
  risk_acknowledged_at?: string | null;
};

/** High-risk work waiting on the user, or an execution that failed. */
export function actionToSignal(
  a: ActionRow,
  scope: ScopeIdentity,
  now: number,
  extras: { projectId?: string; projectLabel?: string } = {},
): AwarenessSignal | null {
  const waiting = a.status === "approved" || a.status === "staged" || a.status === "proposed";
  if (!waiting) return null;
  const days = Math.floor((now - new Date(a.created_at).getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days) || days < 2) return null;

  return {
    id: `action_awaiting_approval:${a.id}`,
    source: "actions",
    type: "action_awaiting_approval",
    scope,
    entityType: "action",
    entityId: a.id,
    projectId: extras.projectId,
    projectLabel: extras.projectLabel,
    timestamp: new Date(now).toISOString(),
    summary: a.risk === "high" ? "A high-risk action is waiting" : "An action is waiting on you",
    why: `"${a.title}" has been sitting ${days} ${days === 1 ? "day" : "days"} without review.`,
    nextStep: "Review it in Actions — nothing runs until you approve it.",
    confidence: 1,
    resolved: false,
    currentState: { status: a.status, risk: a.risk },
    sourceRefs: [{ kind: "action", id: a.id, label: a.title }],
    metadata: { risk: a.risk },
  };
}
