// Urgency — a small, stable, escalation-resistant ladder.
//
// Urgency is NOT interruption. It says how much this matters; delivery.ts
// decides whether, where and how it may ever be said out loud.
import type { AwarenessSignal } from "./signal.ts";
import type { RelevanceResult } from "./relevance.ts";

export type Urgency =
  /** Record only. Never user-visible. */
  | "background"
  /** Eligible to appear next time the relevant context is opened. */
  | "useful"
  /** Eligible for Today proactive awareness. */
  | "attention"
  /** Future-channel eligibility. Today-only for now. */
  | "time_sensitive"
  /** Reserved, rare, never score-derived. */
  | "critical";

export const URGENCY_ORDER: Urgency[] = [
  "background",
  "useful",
  "attention",
  "time_sensitive",
  "critical",
];

export function urgencyRank(u: Urgency): number {
  return URGENCY_ORDER.indexOf(u);
}

/**
 * Critical is a whitelist, never a threshold. Nothing in the current product
 * qualifies, and that is deliberate: the system should resist escalation.
 */
export function isCriticalCondition(signal: AwarenessSignal): boolean {
  const m = signal.metadata ?? {};
  return signal.type === "security_event" && m.blocked === false && m.severity === "critical";
}

export function classifyUrgency(
  signal: AwarenessSignal,
  relevance: RelevanceResult,
): Urgency {
  if (relevance.resolved) return "background";
  if (isCriticalCondition(signal)) return "critical";

  // Time-sensitive requires the clock to actually be against the user — a high
  // score alone is not enough.
  if (relevance.score >= 0.6 && relevance.factors.timeSensitivity >= 0.9) return "time_sensitive";
  if (relevance.score >= 0.45) return "attention";
  if (relevance.score >= 0.25) return "useful";
  return "background";
}

/** Priority integer for the existing nudges lane, derived not invented. */
export function urgencyPriority(u: Urgency): number {
  switch (u) {
    case "critical": return 95;
    case "time_sensitive": return 80;
    case "attention": return 60;
    case "useful": return 35;
    default: return 10;
  }
}
