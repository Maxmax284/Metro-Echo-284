// Second wave of adapters — documents and unrouted captures.
//
// Same rules as the first wave: read real rows, produce grounded signals, stop.
// No scoring, no delivery, no writes. Every helper is pure and takes `now` so
// the tests can pin the clock.
import type { AwarenessSignal, ScopeIdentity } from "./signal.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (from: string, now: number) =>
  Math.floor((now - new Date(from).getTime()) / DAY_MS);

/** A document still mid-flight. */
export type DocumentRow = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
  project_id?: string | null;
};

/** Statuses that mean the document is waiting on a human, not on a machine. */
const WAITING_DOC_STATUSES = new Set(["draft", "drafting", "reviewing", "review", "needs_review"]);
const STALLED_AFTER_DAYS = 3;

/**
 * A draft or review that has gone quiet for days. Not a failure — just work the
 * user started and left behind.
 */
export function documentToSignal(
  d: DocumentRow,
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  if (!WAITING_DOC_STATUSES.has(d.status)) return null;
  const idle = days(d.updated_at, now);
  if (!Number.isFinite(idle) || idle < STALLED_AFTER_DAYS) return null;

  const label = d.title?.trim() || "An untitled document";
  return {
    id: `document_stalled:${d.id}`,
    source: "documents",
    type: "document_stalled",
    scope,
    entityType: "document",
    entityId: d.id,
    projectId: d.project_id ?? undefined,
    timestamp: new Date(now).toISOString(),
    summary: "A document stopped moving",
    why: `"${label}" has been sitting at ${d.status} for ${idle} ${idle === 1 ? "day" : "days"}.`,
    nextStep: "Open it and either finish the pass or park it on purpose.",
    confidence: 0.9,
    resolved: false,
    currentState: { status: d.status, updated_at: d.updated_at },
    sourceRefs: [{ kind: "document", id: d.id, label }],
    metadata: { idle_days: idle, status: d.status },
  };
}

/** A risk raised by a document review. */
export type DocumentRiskRow = {
  id: string;
  document_id: string;
  severity: string;
  title: string;
  created_at: string;
};

const SERIOUS = new Set(["high", "critical", "severe"]);
const RISK_UNREAD_AFTER_DAYS = 2;

/**
 * A serious risk somebody raised on a document that has not moved since.
 * The document row comes from the caller so scope stays the caller's business.
 */
export function documentRiskToSignal(
  r: DocumentRiskRow,
  doc: DocumentRow | undefined,
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  if (!SERIOUS.has(String(r.severity).toLowerCase())) return null;
  if (!doc) return null;
  if (doc.status === "archived" || doc.status === "accepted" || doc.status === "signed") return null;
  const age = days(r.created_at, now);
  if (!Number.isFinite(age) || age < RISK_UNREAD_AFTER_DAYS) return null;

  const label = doc.title?.trim() || "a document";
  return {
    id: `document_risk_unreviewed:${r.id}`,
    source: "documents",
    type: "document_risk_unreviewed",
    scope,
    entityType: "document",
    entityId: doc.id,
    projectId: doc.project_id ?? undefined,
    timestamp: new Date(now).toISOString(),
    summary: "A flagged risk is still unanswered",
    why: `"${r.title}" was flagged ${r.severity} on ${label} ${age} ${age === 1 ? "day" : "days"} ago and nothing changed since.`,
    nextStep: "Open the review and decide: accept it, ask the question, or renegotiate.",
    confidence: 0.9,
    resolved: false,
    currentState: { severity: r.severity, document_status: doc.status },
    sourceRefs: [
      { kind: "document_risk", id: r.id, label: r.title },
      { kind: "document", id: doc.id, label },
    ],
    metadata: { severity: r.severity, age_days: age },
  };
}

/** A capture that landed and was never given a home. */
export type CaptureRouteRow = {
  id: string;
  capture_kind: string | null;
  capture_id: string | null;
  source: string | null;
  suggested_route: string | null;
  user_action: string | null;
  created_at: string;
};

const UNROUTED_AFTER_DAYS = 3;

/**
 * Captured, suggested, never decided. This is the one signal that exists purely
 * because capture must never quietly become a landfill.
 */
export function captureRouteToSignal(
  c: CaptureRouteRow,
  scope: ScopeIdentity,
  now: number,
): AwarenessSignal | null {
  if (c.user_action) return null;
  const age = days(c.created_at, now);
  if (!Number.isFinite(age) || age < UNROUTED_AFTER_DAYS) return null;

  const where = c.source ? `from ${c.source}` : "you captured";
  return {
    id: `capture_unrouted:${c.id}`,
    source: "captures",
    type: "capture_unrouted",
    scope,
    entityType: c.capture_kind ?? "capture",
    entityId: c.capture_id ?? c.id,
    timestamp: new Date(now).toISOString(),
    summary: "Something you captured never got a home",
    why: `A ${c.capture_kind ?? "note"} ${where} has been waiting ${age} ${age === 1 ? "day" : "days"} with no decision.`,
    nextStep: c.suggested_route
      ? `Route it to ${c.suggested_route} or dismiss it — either one closes the loop.`
      : "Give it a home or dismiss it — either one closes the loop.",
    confidence: 0.8,
    resolved: false,
    currentState: { user_action: null, suggested_route: c.suggested_route },
    sourceRefs: [{ kind: "capture_route", id: c.id }],
    metadata: { age_days: age, capture_kind: c.capture_kind },
  };
}
