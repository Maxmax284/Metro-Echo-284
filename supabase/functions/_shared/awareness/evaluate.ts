// The pipeline, as one pure function.
//
// signal -> context -> relevance -> urgency -> suppression -> bundling ->
// communication recommendation -> at most ONE Today nudge.
//
// No I/O here. Callers fetch the rows, call this, then persist. That is what
// keeps the whole thing testable and gives shadow mode something honest to log.
import type { AwarenessSignal } from "./signal.ts";
import { signalDedupeKey } from "./signal.ts";
import { scoreRelevance, type RelevanceContext, type RelevanceResult } from "./relevance.ts";
import { classifyUrgency, urgencyPriority, type Urgency } from "./urgency.ts";
import {
  suppress,
  type AttentionBudget,
  type PriorState,
  type SuppressionReason,
} from "./suppress.ts";
import { bundleSignals, type Bundle, type Candidate } from "./bundle.ts";
import { recommendDelivery, type DeliveryContext, type DeliveryRecommendation } from "./deliver.ts";

/** One audit-friendly record per candidate. Developer-facing, not Receipts. */
export type ShadowRecord = {
  signal_id: string;
  type: string;
  source: string;
  organization_id: string | null;
  dedupe_key: string;
  relevance: RelevanceResult["factors"];
  score: number;
  urgency: Urgency;
  suppressed: boolean;
  suppression_reason: SuppressionReason | null;
  escalated: boolean;
  cooldown_until?: string | null;
  bundle_key: string | null;
  delivery: DeliveryRecommendation;
  would_surface: boolean;
};

export type EvaluateInput = {
  signals: AwarenessSignal[];
  /** Per-signal context, keyed by signal id. */
  context?: Record<string, RelevanceContext>;
  /** Known prior state, keyed by dedupe key. */
  priors?: Record<string, PriorState>;
  budget: AttentionBudget;
  deliveryContext?: DeliveryContext;
  now?: number;
};

export type SurfaceDecision = {
  bundle: Bundle;
  dedupeKey: string;
  urgency: Urgency;
  priority: number;
  delivery: DeliveryRecommendation;
  title: string;
  /** "Why am I seeing this?" — plain English, never a score. */
  why: string;
  nextStep: string;
  entityType?: string;
  entityId?: string;
  bundledCount: number;
};

export type EvaluateResult = {
  records: ShadowRecord[];
  /** The single thing worth saying, or nothing at all. */
  surface: SurfaceDecision | null;
  /** Survivors beyond the leader stay queued, never dumped as a list. */
  queued: number;
};

export function evaluateAwareness(input: EvaluateInput): EvaluateResult {
  const now = input.now ?? Date.now();
  const records: ShadowRecord[] = [];
  const survivors: Candidate[] = [];

  for (const signal of input.signals) {
    const dedupeKey = signalDedupeKey(signal);
    const relevance = scoreRelevance(signal, input.context?.[signal.id] ?? {});
    const urgency = classifyUrgency(signal, relevance);
    const prior = input.priors?.[dedupeKey] ?? null;
    const verdict = suppress(signal, relevance, urgency, prior, input.budget, now);
    const delivery = recommendDelivery(urgency, input.deliveryContext ?? {});

    if (!verdict.suppressed && delivery.live && delivery.recommendedChannel === "today") {
      survivors.push({ signal, urgency, score: relevance.score });
    }

    records.push({
      signal_id: signal.id,
      type: signal.type,
      source: signal.source,
      organization_id: signal.scope.organizationId,
      dedupe_key: dedupeKey,
      relevance: relevance.factors,
      score: relevance.score,
      urgency,
      suppressed: verdict.suppressed,
      suppression_reason: verdict.reason,
      escalated: verdict.escalated,
      cooldown_until: verdict.cooldownUntil ?? null,
      bundle_key: null,
      delivery,
      would_surface: false,
    });
  }

  if (survivors.length === 0) return { records, surface: null, queued: 0 };

  const bundles = bundleSignals(survivors);
  const winner = bundles[0];
  const lead = winner.lead.signal;

  for (const b of bundles) {
    for (const m of b.members) {
      const rec = records.find((r) => r.signal_id === m.signal.id);
      if (rec) {
        rec.bundle_key = b.key;
        rec.would_surface = b.key === winner.key;
      }
    }
  }

  return {
    records,
    surface: {
      bundle: winner,
      dedupeKey: signalDedupeKey(lead),
      urgency: winner.urgency,
      priority: urgencyPriority(winner.urgency),
      delivery: recommendDelivery(winner.urgency, input.deliveryContext ?? {}),
      title: winner.title,
      why: winner.why,
      nextStep: lead.nextStep,
      entityType: lead.entityType,
      entityId: lead.entityId,
      bundledCount: winner.members.length,
    },
    queued: Math.max(0, survivors.length - winner.members.length),
  };
}
