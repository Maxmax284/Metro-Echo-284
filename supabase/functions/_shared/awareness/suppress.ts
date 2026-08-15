// Suppression — built before delivery expands, on purpose.
//
// Vanta earns interruptions. This is where most candidates die quietly.
import type { AwarenessSignal } from "./signal.ts";
import { isGrounded } from "./signal.ts";
import type { RelevanceResult } from "./relevance.ts";
import { type Urgency, urgencyRank } from "./urgency.ts";

export type SuppressionReason =
  | "resolved"
  | "ungrounded"
  | "low_confidence"
  | "duplicate"
  | "cooldown"
  | "acknowledged"
  | "not_important"
  | "snoozed"
  | "quiet_hours"
  | "stale"
  | "attention_budget"
  | "below_threshold";

/** What we already know about this exact situation, from nudges + corrections. */
export type PriorState = {
  dedupeKey: string;
  lastSurfacedAt?: string | null;
  lastUrgency?: Urgency | null;
  /** Existing nudge status for the situation. */
  status?: "pending" | "seen" | "dismissed" | "acted" | null;
  /** User said "not important" through the corrections lane. */
  notImportant?: boolean;
  /** ISO time the user snoozed until, when snooze is used. */
  snoozedUntil?: string | null;
};

export type AttentionBudget = {
  /** Proactive nudges surfaced in the last 24h, this scope. */
  surfacedLast24h: number;
  /** Dismissals in the last 7 days, this scope. */
  dismissedLast7d: number;
  inQuietHours: boolean;
};

export type SuppressionVerdict = {
  suppressed: boolean;
  reason: SuppressionReason | null;
  /** True when a suppressed-by-cooldown item is allowed back because it got worse. */
  escalated: boolean;
  cooldownUntil?: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 3 * DAY;
const STALE_MS = 21 * DAY;
const MIN_CONFIDENCE = 0.35;

/**
 * Attention has a cost. The more Vanta has already said recently, the higher
 * the bar for the next low-value note. Simple, explainable, testable.
 */
export function budgetFloor(budget: AttentionBudget): Urgency {
  if (budget.surfacedLast24h >= 3 || budget.dismissedLast7d >= 5) return "time_sensitive";
  if (budget.surfacedLast24h >= 1 || budget.dismissedLast7d >= 2) return "attention";
  return "useful";
}

export function suppress(
  signal: AwarenessSignal,
  relevance: RelevanceResult,
  urgency: Urgency,
  prior: PriorState | null,
  budget: AttentionBudget,
  now = Date.now(),
): SuppressionVerdict {
  const quiet = (reason: SuppressionReason, extra: Partial<SuppressionVerdict> = {}) => ({
    suppressed: true, reason, escalated: false, ...extra,
  });

  // Resolution recheck first — a situation fixed four minutes ago is not news.
  if (relevance.resolved) return quiet("resolved");
  if (!isGrounded(signal)) return quiet("ungrounded");
  if ((signal.confidence ?? 0.6) < MIN_CONFIDENCE) return quiet("low_confidence");

  // Anything below Attention never reaches Today at all.
  if (urgencyRank(urgency) < urgencyRank("attention")) return quiet("below_threshold");

  // Stale decay: an old signal that never mattered enough goes away.
  const age = now - new Date(signal.timestamp).getTime();
  if (Number.isFinite(age) && age > STALE_MS && urgencyRank(urgency) < urgencyRank("critical")) {
    return quiet("stale");
  }

  const worseThanBefore =
    prior?.lastUrgency ? urgencyRank(urgency) > urgencyRank(prior.lastUrgency) : false;

  if (prior) {
    if (prior.snoozedUntil && new Date(prior.snoozedUntil).getTime() > now) return quiet("snoozed");
    if (prior.notImportant && !worseThanBefore) return quiet("not_important");
    if ((prior.status === "dismissed" || prior.status === "acted") && !worseThanBefore) {
      return quiet("acknowledged");
    }
    if (prior.status === "pending") return quiet("duplicate");

    if (prior.lastSurfacedAt) {
      const since = now - new Date(prior.lastSurfacedAt).getTime();
      if (since < COOLDOWN_MS && !worseThanBefore) {
        return quiet("cooldown", {
          cooldownUntil: new Date(new Date(prior.lastSurfacedAt).getTime() + COOLDOWN_MS).toISOString(),
        });
      }
    }
  }

  // Quiet hours hold rather than drop: Today shows it next time it is opened.
  if (budget.inQuietHours && urgency !== "critical") return quiet("quiet_hours");

  if (urgencyRank(urgency) < urgencyRank(budgetFloor(budget))) return quiet("attention_budget");

  return { suppressed: false, reason: null, escalated: worseThanBefore };
}
