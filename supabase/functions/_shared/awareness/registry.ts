// Signal registry — the open vocabulary seam.
//
// Before this file, adding a sense meant editing a union in signal.ts AND a
// score table in relevance.ts AND remembering both. A new adapter now registers
// its own kinds in one place: source, kind, and the base impact the central
// judgment layer should assume for it.
//
// Registration supplies FACTS ONLY. It cannot set urgency, cannot pick a
// channel, and cannot bypass relevance/suppression — those stay central by
// design (see .lovable/vanta-next-generation-architecture.md).
//
// Pure module. No IO. Safe to mirror into the client.

/** Sources live in the product today. Future adapters register their own. */
export const KNOWN_SIGNAL_SOURCES = [
  "drift",
  "commitments",
  "actions",
  "continuity",
  "security",
  "documents",
  "captures",
  "sherlock",
  "watch",
  "reach",
] as const;

export type KnownSignalSource = (typeof KNOWN_SIGNAL_SOURCES)[number];

/** Kinds live in the product today. */
export const KNOWN_SIGNAL_KINDS = [
  "project_went_silent",
  "commitment_drifting",
  "commitment_due_soon",
  "commitment_overdue",
  "risk_unread",
  "action_awaiting_approval",
  "action_failed",
  "continuity_changed",
  "security_event",
  "document_stalled",
  "document_risk_unreviewed",
  "capture_unrouted",
  "sherlock_finding_pending",
  "web_page_changed",
  "inbound_needs_you",
] as const;

export type KnownSignalKind = (typeof KNOWN_SIGNAL_KINDS)[number];

export type SignalKindSpec = {
  kind: string;
  source: string;
  /**
   * 0..1 — what happens if the user never sees it. This is the ONLY judgment
   * input an adapter may declare, and it is a weight, not a verdict.
   */
  baseImpact: number;
  /** Short human label for receipts and docs. */
  label?: string;
};

const BASE_IMPACT_DEFAULT = 0.3;

const REGISTRY = new Map<string, SignalKindSpec>();

function seed(kind: KnownSignalKind, source: KnownSignalSource, baseImpact: number) {
  REGISTRY.set(kind, { kind, source, baseImpact });
}

// The live vocabulary, with the impact weights relevance.ts has always used.
seed("security_event", "security", 0.9);
seed("risk_unread", "security", 0.8);
seed("action_failed", "actions", 0.75);
seed("commitment_overdue", "commitments", 0.7);
seed("document_risk_unreviewed", "documents", 0.7);
seed("action_awaiting_approval", "actions", 0.6);
seed("commitment_drifting", "commitments", 0.6);
seed("commitment_due_soon", "commitments", 0.55);
seed("document_stalled", "documents", 0.4);
seed("sherlock_finding_pending", "sherlock", 0.4);
seed("project_went_silent", "drift", 0.4);
seed("continuity_changed", "continuity", 0.35);
seed("capture_unrouted", "captures", 0.3);
/* A watched page moved because the person asked for that page to be watched. */
seed("web_page_changed", "watch", 0.5);
/* A watch ended without an answer. Failure is a status, never silence. */
seed("watch_failed", "watch", 0.6);
/* A signed signal from a first-party system that already earns an interruption. */
seed("inbound_needs_you", "reach", 0.7);

/**
 * Register a signal kind from a new adapter. Idempotent: re-registering the
 * same kind with the same spec is a no-op, so module load order never matters.
 */
export function registerSignalKind(spec: SignalKindSpec): SignalKindSpec {
  const clamped: SignalKindSpec = {
    ...spec,
    baseImpact: Math.min(1, Math.max(0, Number.isFinite(spec.baseImpact) ? spec.baseImpact : BASE_IMPACT_DEFAULT)),
  };
  REGISTRY.set(clamped.kind, clamped);
  return clamped;
}

export function signalKindSpec(kind: string): SignalKindSpec | null {
  return REGISTRY.get(kind) ?? null;
}

/** Base impact weight for a kind. Unknown kinds are quiet, never loud. */
export function signalBaseImpact(kind: string): number {
  return REGISTRY.get(kind)?.baseImpact ?? BASE_IMPACT_DEFAULT;
}

export function registeredSignalKinds(): SignalKindSpec[] {
  return [...REGISTRY.values()];
}

/** True when a kind came from the live product rather than a later adapter. */
export function isKnownSignalKind(kind: string): kind is KnownSignalKind {
  return (KNOWN_SIGNAL_KINDS as readonly string[]).includes(kind);
}
