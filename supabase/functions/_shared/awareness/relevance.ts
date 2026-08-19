// Relevance — deterministic, inspectable, no AI.
//
// A new event is not automatically important. This stage answers "does this
// matter?" using grounded factors only. AI may later phrase a signal; it never
// decides whether the user gets interrupted.
import type { AwarenessSignal } from "./signal.ts";

export type RelevanceFactors = {
  /** What happens if ignored. 0..1 */
  impact: number;
  /** Does it matter now / today / later. 0..1 */
  timeSensitivity: number;
  /** Did anything materially change. 0..1 */
  changeMagnitude: number;
  /** Tied to an unresolved thread. 0..1 */
  continuity: number;
  /** Pinned, committed to, repeatedly revisited. 0..1 */
  userIntent: number;
  /** Certainty of the underlying signal. 0..1 */
  confidence: number;
};

export type RelevanceResult = {
  score: number;
  factors: RelevanceFactors;
  /** Present when the situation already resolved itself. */
  resolved: boolean;
};

export type RelevanceContext = {
  /** Project/entity is pinned. */
  pinned?: boolean;
  /** User has an open commitment against this thread. */
  committed?: boolean;
  /** Times the user has opened this thread recently. */
  revisits?: number;
  /** Hours until the thing is due, when there is a due date. */
  hoursUntilDue?: number | null;
  /** Days the situation has been unresolved. */
  daysUnresolved?: number;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

const BASE_IMPACT: Record<string, number> = {
  security_event: 0.9,
  risk_unread: 0.8,
  action_failed: 0.75,
  commitment_overdue: 0.7,
  action_awaiting_approval: 0.6,
  commitment_drifting: 0.6,
  commitment_due_soon: 0.55,
  document_risk_unreviewed: 0.7,
  document_stalled: 0.4,
  capture_unrouted: 0.3,
  sherlock_finding_pending: 0.4,
  project_went_silent: 0.4,
  continuity_changed: 0.35,
};

/** Time sensitivity purely from the clock, not from vibes. */
export function timeSensitivity(hoursUntilDue: number | null | undefined): number {
  if (hoursUntilDue == null) return 0.2;
  if (hoursUntilDue < 0) return 1; // already past
  if (hoursUntilDue <= 12) return 0.9;
  if (hoursUntilDue <= 48) return 0.7;
  if (hoursUntilDue <= 24 * 7) return 0.4;
  return 0.2;
}

export function scoreRelevance(
  signal: AwarenessSignal,
  ctx: RelevanceContext = {},
): RelevanceResult {
  const impact = clamp01(BASE_IMPACT[signal.type] ?? 0.3);
  const time = clamp01(timeSensitivity(ctx.hoursUntilDue));

  // Change magnitude: an unresolved situation that has been sitting is a bigger
  // change than one that appeared a minute ago and may still resolve itself.
  const days = ctx.daysUnresolved ?? 0;
  const changeMagnitude = clamp01(
    signal.previousState !== undefined && signal.currentState !== undefined ? 0.7 : 0.3,
  ) * 0.6 + clamp01(days / 14) * 0.4;

  const continuity = clamp01((ctx.committed ? 0.6 : 0) + Math.min(0.4, (ctx.revisits ?? 0) * 0.15));
  const userIntent = clamp01((ctx.pinned ? 0.6 : 0) + (ctx.committed ? 0.4 : 0));
  const confidence = clamp01(signal.confidence ?? 0.6);

  const factors: RelevanceFactors = {
    impact,
    timeSensitivity: time,
    changeMagnitude: clamp01(changeMagnitude),
    continuity,
    userIntent,
    confidence,
  };

  // Weighted, deterministic. Confidence multiplies rather than adds so weak
  // evidence can never be argued up by the other factors.
  const weighted =
    factors.impact * 0.32 +
    factors.timeSensitivity * 0.26 +
    factors.changeMagnitude * 0.18 +
    factors.continuity * 0.14 +
    factors.userIntent * 0.1;

  const score = clamp01(weighted * (0.5 + factors.confidence * 0.5));

  return { score: Math.round(score * 1000) / 1000, factors, resolved: Boolean(signal.resolved) };
}
