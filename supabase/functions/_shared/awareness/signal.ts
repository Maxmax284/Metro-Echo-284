// AwarenessSignal — the one normalized vocabulary for every proactive candidate.
//
// Integrations produce signals. They do NOT decide how to interrupt the user.
// Relevance, urgency, suppression and delivery are separate, later stages.
//
// Naming note: `VantaSignal` is already taken by the awareness/briefing content
// contract (src/lib/vantaSignal.ts). This is the telemetry-side model.

export type ScopeIdentity = {
  userId: string;
  /** null means Personal. Never inferred, never merged across scopes. */
  organizationId: string | null;
};

/** Where a signal came from. Future adapters add their own source strings. */
export type SignalSource =
  | "drift"
  | "commitments"
  | "actions"
  | "continuity"
  | "security"
  | "documents"
  | "captures";

export type SignalKind =
  // live, existing-product families
  | "project_went_silent"
  | "commitment_drifting"
  | "commitment_due_soon"
  | "commitment_overdue"
  | "risk_unread"
  | "action_awaiting_approval"
  | "action_failed"
  | "continuity_changed"
  | "security_event"
  | "document_stalled"
  | "document_risk_unreviewed"
  | "capture_unrouted";

export type SourceReference = {
  kind: string;
  id: string;
  label?: string;
};

export type AwarenessSignal = {
  /** Stable per situation, not per evaluation run. */
  id: string;
  source: SignalSource;
  type: SignalKind;
  scope: ScopeIdentity;
  entityType?: string;
  entityId?: string;
  projectId?: string;
  projectLabel?: string;
  timestamp: string;

  /** One line, plain English, no scores. */
  summary: string;
  /** Answer to "why am I seeing this?" */
  why: string;
  /** The single least-intrusive useful next step. */
  nextStep: string;

  previousState?: unknown;
  currentState?: unknown;

  /** 0..1. Weak evidence must not surface. */
  confidence?: number;

  /** Real records only. A signal with no refs is not grounded. */
  sourceRefs?: SourceReference[];

  /** True when the underlying situation already resolved itself. */
  resolved?: boolean;

  metadata?: Record<string, unknown>;
};

/**
 * The seam future telemetry plugs into: calendar, device state, coarse
 * location, wearable, vehicle, IoT, other business platforms. Each adapter
 * normalizes its own input into AwarenessSignals and stops there — it never
 * scores, ranks or delivers. No placeholder adapters are shipped.
 */
export interface SignalAdapter<T> {
  source: SignalSource | string;
  normalize(input: T, scope: ScopeIdentity, now: number): AwarenessSignal[];
}

/** A signal is only usable if it points at real records. */
export function isGrounded(signal: AwarenessSignal): boolean {
  return (signal.sourceRefs?.length ?? 0) > 0 && Boolean(signal.entityId ?? signal.projectId);
}

/**
 * Situation identity, scope-segmented. Two workspaces with the same drift stay
 * two distinct situations; the same situation across runs stays one.
 */
export function signalDedupeKey(signal: AwarenessSignal): string {
  const org = signal.scope.organizationId ?? "personal";
  const anchor = signal.entityId ?? signal.projectId ?? signal.id;
  return `aw:${signal.type}:${anchor}:${org}`;
}
