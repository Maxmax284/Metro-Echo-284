import { describe, it, expect } from "vitest";
import {
  sherlockFindingToSignal,
  recheckNudge,
  type SherlockFindingRow,
} from "@/lib/awareness";

const NOW = new Date("2026-03-10T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const scope = { userId: "u1", organizationId: null };

const finding = (over: Partial<SherlockFindingRow> = {}): SherlockFindingRow => ({
  id: "f1",
  finding_type: "stale_commitment",
  summary: "Still open past due: \"Send the invoice\"",
  rationale: "Due 5d ago, no nudge since.",
  confidence: "medium",
  status: "pending",
  sensitive_flag: false,
  suggested_action: "renegotiate_or_close",
  source_object_type: "commitment",
  source_object_id: "c1",
  created_at: new Date(NOW - 4 * DAY).toISOString(),
  ...over,
});

describe("sherlockFindingToSignal", () => {
  it("surfaces a pending medium-confidence finding that sat for days", () => {
    const s = sherlockFindingToSignal(finding(), scope, NOW);
    expect(s).not.toBeNull();
    expect(s!.type).toBe("sherlock_finding_pending");
    expect(s!.entityType).toBe("sherlock_finding");
    expect(s!.entityId).toBe("f1");
    expect(s!.confidence).toBe(0.7);
    expect(s!.why).toContain("4 days ago");
  });

  it("stays quiet while the finding is still fresh", () => {
    const fresh = finding({ created_at: new Date(NOW - 6 * 60 * 60 * 1000).toISOString() });
    expect(sherlockFindingToSignal(fresh, scope, NOW)).toBeNull();
  });

  it("never surfaces low-confidence findings", () => {
    expect(sherlockFindingToSignal(finding({ confidence: "low" }), scope, NOW)).toBeNull();
  });

  it("never surfaces sensitive findings proactively", () => {
    expect(sherlockFindingToSignal(finding({ sensitive_flag: true }), scope, NOW)).toBeNull();
  });

  it("ignores findings the user already answered", () => {
    expect(sherlockFindingToSignal(finding({ status: "dismissed" }), scope, NOW)).toBeNull();
    expect(sherlockFindingToSignal(finding({ status: "accepted" }), scope, NOW)).toBeNull();
  });

  it("carries the active room on the signal", () => {
    const s = sherlockFindingToSignal(finding(), { userId: "u1", organizationId: "org1" }, NOW);
    expect(s!.scope.organizationId).toBe("org1");
  });
});

describe("recheckNudge for sherlock findings", () => {
  const nudge = {
    id: "n1",
    kind: "sherlock_finding_pending",
    related_entity_type: "sherlock_finding",
    related_entity_id: "f1",
    dedupe_key: "k1",
  };

  it("keeps the nudge while the finding is still pending", () => {
    const v = recheckNudge(nudge, {
      commitments: {}, actions: {}, projects: {}, sherlockFindings: { f1: "pending" },
    }, NOW);
    expect(v.stillTrue).toBe(true);
  });

  it("retires the nudge once the finding is answered", () => {
    for (const status of ["accepted", "dismissed", "acted"]) {
      const v = recheckNudge(nudge, {
        commitments: {}, actions: {}, projects: {}, sherlockFindings: { f1: status },
      }, NOW);
      expect(v).toEqual({ stillTrue: false, reason: "finding_answered" });
    }
  });

  it("retires the nudge when the finding is gone from this room", () => {
    const v = recheckNudge(nudge, {
      commitments: {}, actions: {}, projects: {}, sherlockFindings: {},
    }, NOW);
    expect(v).toEqual({ stillTrue: false, reason: "entity_gone" });
  });
});
