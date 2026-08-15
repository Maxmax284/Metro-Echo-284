// The awareness pipeline must be boring and inspectable: same inputs, same
// verdict, every time. Silence is the default outcome.
import { describe, expect, it } from "vitest";
import {
  actionToSignal,
  bundleSignals,
  budgetFloor,
  classifyUrgency,
  commitmentToSignal,
  driftToSignal,
  evaluateAwareness,
  isCriticalCondition,
  isGrounded,
  LIVE_CHANNELS,
  recommendDelivery,
  scoreRelevance,
  signalDedupeKey,
  suppress,
  urgencyPriority,
  type AttentionBudget,
  type AwarenessSignal,
  type Candidate,
} from "@/lib/awareness";
import type { DriftSignal } from "@/lib/drift";

const NOW = new Date("2026-08-15T12:00:00Z").getTime();
const daysBefore = (n: number) => new Date(NOW - n * 86400_000).toISOString();
const PERSONAL = { userId: "u1", organizationId: null };
const ORG = { userId: "u1", organizationId: "org-9" };
const CALM: AttentionBudget = { surfacedLast24h: 0, dismissedLast7d: 0, inQuietHours: false };

const drift: DriftSignal = {
  kind: "risk_unread",
  title: "A high-risk action is waiting",
  reason: '"Wire deposit" has been sitting for 4 days without review.',
  next_step: "Review it in Actions — nothing runs until you approve it.",
  related_entity_type: "action",
  related_entity_id: "a1",
  priority: 70,
  dedupe_key: "drift_risk:a1",
};

const signal = (over: Partial<AwarenessSignal> = {}): AwarenessSignal => ({
  ...driftToSignal(drift, PERSONAL, NOW),
  ...over,
});

describe("normalization", () => {
  it("carries grounded refs and plain-English copy from the detector", () => {
    const s = driftToSignal(drift, PERSONAL, NOW);
    expect(s.type).toBe("risk_unread");
    expect(s.entityId).toBe("a1");
    expect(s.why).toContain("4 days");
    expect(isGrounded(s)).toBe(true);
  });

  it("refuses to treat an unreferenced signal as grounded", () => {
    expect(isGrounded(signal({ sourceRefs: [], entityId: undefined, projectId: undefined }))).toBe(false);
  });

  it("normalizes commitments only inside the 48h window", () => {
    const soon = commitmentToSignal(
      { id: "c1", summary: "Send the deck", due_at: new Date(NOW + 6 * 3600_000).toISOString(), status: "open" },
      PERSONAL, NOW,
    );
    expect(soon?.type).toBe("commitment_due_soon");
    const far = commitmentToSignal(
      { id: "c2", summary: "Later", due_at: new Date(NOW + 20 * 86400_000).toISOString(), status: "open" },
      PERSONAL, NOW,
    );
    expect(far).toBeNull();
    const done = commitmentToSignal(
      { id: "c3", summary: "Done", due_at: daysBefore(1), status: "done" },
      PERSONAL, NOW,
    );
    expect(done).toBeNull();
  });

  it("ignores actions that only just arrived", () => {
    const fresh = actionToSignal(
      { id: "a2", title: "New", risk: "high", status: "staged", created_at: new Date(NOW - 3600_000).toISOString() },
      PERSONAL, NOW,
    );
    expect(fresh).toBeNull();
    const stale = actionToSignal(
      { id: "a3", title: "Old", risk: "high", status: "staged", created_at: daysBefore(5) },
      PERSONAL, NOW,
    );
    expect(stale?.type).toBe("action_awaiting_approval");
  });
});

describe("relevance", () => {
  it("weighs impact, clock and intent without any AI", () => {
    const hot = scoreRelevance(signal(), { hoursUntilDue: 2, committed: true, pinned: true, daysUnresolved: 6 });
    const cold = scoreRelevance(
      signal({ type: "continuity_changed", confidence: 0.5 }),
      { hoursUntilDue: null },
    );
    expect(hot.score).toBeGreaterThan(cold.score);
  });

  it("lets weak confidence cap the score rather than be argued up", () => {
    const strong = scoreRelevance(signal({ confidence: 1 }), { hoursUntilDue: 1 });
    const weak = scoreRelevance(signal({ confidence: 0.4 }), { hoursUntilDue: 1 });
    expect(weak.score).toBeLessThan(strong.score);
  });
});

describe("urgency ladder", () => {
  it("puts a resolved situation back to background", () => {
    const s = signal({ resolved: true });
    expect(classifyUrgency(s, scoreRelevance(s, { hoursUntilDue: -1 }))).toBe("background");
  });

  it("needs the clock, not just a high score, for time-sensitive", () => {
    const s = signal();
    expect(classifyUrgency(s, scoreRelevance(s, { hoursUntilDue: -1, committed: true, pinned: true })))
      .toBe("time_sensitive");
    expect(classifyUrgency(s, scoreRelevance(s, { hoursUntilDue: 24 * 10 }))).not.toBe("time_sensitive");
  });

  it("resists escalation: critical is a whitelist, never a threshold", () => {
    const loud = signal({ confidence: 1 });
    expect(classifyUrgency(loud, scoreRelevance(loud, { hoursUntilDue: -5, pinned: true, committed: true })))
      .not.toBe("critical");
    expect(isCriticalCondition(signal({ type: "security_event", metadata: { blocked: false, severity: "critical" } })))
      .toBe(true);
    expect(isCriticalCondition(signal({ type: "security_event", metadata: { blocked: true, severity: "critical" } })))
      .toBe(false);
  });

  it("derives the nudge priority instead of inventing one", () => {
    expect(urgencyPriority("attention")).toBeLessThan(urgencyPriority("time_sensitive"));
    expect(urgencyPriority("background")).toBeLessThan(urgencyPriority("useful"));
  });
});

describe("dedupe identity", () => {
  it("keeps the same situation distinct per scope", () => {
    expect(signalDedupeKey(signal({ scope: PERSONAL }))).not.toBe(signalDedupeKey(signal({ scope: ORG })));
  });

  it("keeps the same situation stable across runs", () => {
    expect(signalDedupeKey(driftToSignal(drift, PERSONAL, NOW)))
      .toBe(signalDedupeKey(driftToSignal(drift, PERSONAL, NOW + 3600_000)));
  });
});

describe("suppression", () => {
  const evaluate = (over: Partial<Parameters<typeof suppress>> = [] as never) => over;
  const run = (
    s: AwarenessSignal,
    prior: Parameters<typeof suppress>[3],
    budget: AttentionBudget = CALM,
  ) => {
    const rel = scoreRelevance(s, { hoursUntilDue: 3, committed: true });
    return suppress(s, rel, classifyUrgency(s, rel), prior, budget, NOW);
  };

  it("kills a candidate that already resolved itself", () => {
    expect(run(signal({ resolved: true }), null).reason).toBe("resolved");
  });

  it("kills ungrounded and weak-evidence candidates", () => {
    expect(run(signal({ sourceRefs: [], entityId: undefined }), null).reason).toBe("ungrounded");
    expect(run(signal({ confidence: 0.1 }), null).reason).toBe("low_confidence");
  });

  it("does not repeat a pending or acknowledged situation", () => {
    const key = signalDedupeKey(signal());
    expect(run(signal(), { dedupeKey: key, status: "pending" }).reason).toBe("duplicate");
    expect(run(signal(), { dedupeKey: key, status: "dismissed" }).reason).toBe("acknowledged");
    expect(run(signal(), { dedupeKey: key, notImportant: true }).reason).toBe("not_important");
  });

  it("holds inside the cooldown window but lets a worsening signal back through", () => {
    const key = signalDedupeKey(signal());
    const cooling = run(signal(), {
      dedupeKey: key, lastSurfacedAt: daysBefore(1), lastUrgency: "attention",
    });
    expect(cooling.reason).toBe("cooldown");

    const worse = suppress(
      signal(),
      scoreRelevance(signal(), { hoursUntilDue: -1, committed: true, pinned: true }),
      "time_sensitive",
      { dedupeKey: key, lastSurfacedAt: daysBefore(1), lastUrgency: "attention" },
      CALM,
      NOW,
    );
    expect(worse.suppressed).toBe(false);
    expect(worse.escalated).toBe(true);
  });

  it("respects an explicit snooze", () => {
    const key = signalDedupeKey(signal());
    expect(run(signal(), { dedupeKey: key, snoozedUntil: new Date(NOW + 86400_000).toISOString() }).reason)
      .toBe("snoozed");
  });

  it("holds everything but critical during quiet hours", () => {
    expect(run(signal(), null, { ...CALM, inQuietHours: true }).reason).toBe("quiet_hours");
  });

  it("lets old low-value signals decay", () => {
    expect(run(signal({ timestamp: daysBefore(40) }), null).reason).toBe("stale");
  });

  it("raises the bar when Vanta has already spoken recently", () => {
    expect(budgetFloor(CALM)).toBe("useful");
    expect(budgetFloor({ ...CALM, surfacedLast24h: 1 })).toBe("attention");
    expect(budgetFloor({ ...CALM, surfacedLast24h: 4 })).toBe("time_sensitive");
    expect(run(signal(), null, { ...CALM, surfacedLast24h: 4 }).reason).toBe("attention_budget");
  });

  it("never lets background or useful reach Today", () => {
    const s = signal({ type: "continuity_changed", confidence: 0.4 });
    const rel = scoreRelevance(s, { hoursUntilDue: null });
    expect(suppress(s, rel, classifyUrgency(s, rel), null, CALM, NOW).reason).toBe("below_threshold");
  });
});

describe("bundling", () => {
  const cand = (id: string, project: string | undefined, urgency: Candidate["urgency"], score: number): Candidate => ({
    signal: signal({ id, entityId: id, projectId: project, projectLabel: project ? "CampStay" : undefined }),
    urgency,
    score,
  });

  it("collapses several attention-level items in one project into one sentence", () => {
    const bundles = bundleSignals([
      cand("s1", "p1", "attention", 0.5),
      cand("s2", "p1", "attention", 0.6),
      cand("s3", "p1", "attention", 0.45),
    ]);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].title).toBe("CampStay has 3 items needing attention");
  });

  it("keeps time-sensitive items on their own sentence", () => {
    const bundles = bundleSignals([
      cand("s1", "p1", "attention", 0.5),
      cand("s2", "p1", "time_sensitive", 0.8),
    ]);
    expect(bundles).toHaveLength(2);
    expect(bundles[0].lead.urgency).toBe("time_sensitive");
  });

  it("never merges unrelated projects", () => {
    const bundles = bundleSignals([cand("s1", "p1", "attention", 0.5), cand("s2", "p2", "attention", 0.5)]);
    expect(bundles).toHaveLength(2);
  });
});

describe("delivery recommendation", () => {
  it("only ever goes live on Today in this phase", () => {
    expect(LIVE_CHANNELS).toEqual(["silent", "today"]);
    const attention = recommendDelivery("attention");
    expect(attention.recommendedChannel).toBe("today");
    expect(attention.live).toBe(true);

    const urgent = recommendDelivery("time_sensitive");
    expect(urgent.recommendedChannel).toBe("today");
    expect(urgent.futureChannel).toBe("phone");
  });

  it("keeps quiet for background and useful", () => {
    expect(recommendDelivery("useful").recommendedChannel).toBe("silent");
    expect(recommendDelivery("background").live).toBe(true);
    expect(recommendDelivery("background").recommendedChannel).toBe("silent");
  });

  it("compresses format as urgency rises", () => {
    expect(recommendDelivery("attention").recommendedFormat).toBe("summary");
    expect(recommendDelivery("time_sensitive").recommendedFormat).toBe("short");
    expect(recommendDelivery("critical").recommendedFormat).toBe("urgent");
  });
});

describe("evaluateAwareness", () => {
  const commitment = (id: string, hours: number) =>
    commitmentToSignal(
      { id, summary: `Promise ${id}`, due_at: new Date(NOW + hours * 3600_000).toISOString(), status: "open" },
      PERSONAL, NOW,
    )!;

  it("records every candidate, surfaces at most one", () => {
    const res = evaluateAwareness({
      signals: [commitment("c1", 3), commitment("c2", 10), signal()],
      budget: CALM,
      now: NOW,
    });
    expect(res.records).toHaveLength(3);
    expect(res.surface).not.toBeNull();
    expect(res.records.filter((r) => r.would_surface).length).toBeGreaterThan(0);
  });

  it("says nothing when everything is suppressed", () => {
    const res = evaluateAwareness({
      signals: [commitment("c1", 3)],
      budget: { ...CALM, inQuietHours: true },
      now: NOW,
    });
    expect(res.surface).toBeNull();
    expect(res.records[0].suppression_reason).toBe("quiet_hours");
  });

  it("carries a why line and never a raw score into the surface decision", () => {
    const res = evaluateAwareness({ signals: [commitment("c1", 3)], budget: CALM, now: NOW });
    expect(res.surface?.why).toContain("due in");
    expect(res.surface?.why).not.toMatch(/0\.\d/);
  });

  it("keeps extra survivors queued instead of dumping a list", () => {
    const res = evaluateAwareness({
      signals: [commitment("c1", 1), commitment("c2", 2), commitment("c3", 3)],
      budget: CALM,
      now: NOW,
    });
    expect(res.surface?.bundledCount).toBe(1);
    expect(res.queued).toBe(2);
  });

  it("keeps scopes apart in the recorded dedupe keys", () => {
    const res = evaluateAwareness({
      signals: [signal({ scope: PERSONAL }), signal({ id: "risk_unread:a1", scope: ORG })],
      budget: CALM,
      now: NOW,
    });
    const keys = new Set(res.records.map((r) => r.dedupe_key));
    expect(keys.size).toBe(2);
  });

  it("honors prior state passed in from the database", () => {
    const s = commitment("c1", 3);
    const res = evaluateAwareness({
      signals: [s],
      priors: { [signalDedupeKey(s)]: { dedupeKey: signalDedupeKey(s), status: "dismissed" } },
      budget: CALM,
      now: NOW,
    });
    expect(res.surface).toBeNull();
    expect(res.records[0].suppression_reason).toBe("acknowledged");
  });
});
