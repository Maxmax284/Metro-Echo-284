import { describe, expect, it } from "vitest";
import {
  captureRouteToSignal,
  documentRiskToSignal,
  documentToSignal,
  recheckNudge,
  type DocumentRow,
} from "@/lib/awareness";

const scope = { userId: "u1", organizationId: null };
const NOW = Date.parse("2026-08-19T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

const doc = (over: Partial<DocumentRow> = {}): DocumentRow => ({
  id: "d1",
  title: "Lease v2",
  status: "reviewing",
  updated_at: daysAgo(5),
  project_id: "p1",
  ...over,
});

describe("document adapters", () => {
  it("flags a review that stopped moving", () => {
    const s = documentToSignal(doc(), scope, NOW);
    expect(s?.type).toBe("document_stalled");
    expect(s?.why).toContain("5 days");
    expect(s?.entityId).toBe("d1");
  });

  it("stays quiet on fresh or settled documents", () => {
    expect(documentToSignal(doc({ updated_at: daysAgo(1) }), scope, NOW)).toBeNull();
    expect(documentToSignal(doc({ status: "archived" }), scope, NOW)).toBeNull();
    expect(documentToSignal(doc({ status: "reviewed" }), scope, NOW)).toBeNull();
    expect(documentToSignal(doc({ status: "approved" }), scope, NOW)).toBeNull();
  });

  it("keeps a drafted document visible when review never starts", () => {
    expect(documentToSignal(doc({ status: "drafted" }), scope, NOW)?.type).toBe("document_stalled");
  });

  it("flags serious unanswered risks only", () => {
    const risk = { id: "r1", document_id: "d1", severity: "high", title: "Auto-renew", created_at: daysAgo(4) };
    expect(documentRiskToSignal(risk, doc(), scope, NOW)?.type).toBe("document_risk_unreviewed");
    expect(documentRiskToSignal({ ...risk, severity: "low" }, doc(), scope, NOW)).toBeNull();
    expect(documentRiskToSignal({ ...risk, created_at: daysAgo(1) }, doc(), scope, NOW)).toBeNull();
    expect(documentRiskToSignal(risk, doc({ status: "signed" }), scope, NOW)).toBeNull();
    expect(documentRiskToSignal(risk, undefined, scope, NOW)).toBeNull();
  });
});

describe("capture route adapter", () => {
  const route = {
    id: "c1",
    capture_kind: "note",
    capture_id: "n1",
    source: "telegram",
    suggested_route: "Memory",
    user_action: null as string | null,
    created_at: daysAgo(4),
  };

  it("flags captures nobody decided on", () => {
    const s = captureRouteToSignal(route, scope, NOW);
    expect(s?.type).toBe("capture_unrouted");
    expect(s?.entityId).toBe("n1");
    expect(s?.nextStep).toContain("Memory");
  });

  it("stays quiet once routed or still fresh", () => {
    expect(captureRouteToSignal({ ...route, user_action: "accepted" }, scope, NOW)).toBeNull();
    expect(captureRouteToSignal({ ...route, created_at: daysAgo(1) }, scope, NOW)).toBeNull();
  });
});

describe("resolution recheck for the new kinds", () => {
  const state = {
    commitments: {},
    actions: {},
    projects: {},
    documents: { d1: "signed", d2: "reviewing", d3: "approved" },
    captures: { n1: "accepted", n2: null },
  };

  it("retires a nudge once the document settles", () => {
    expect(
      recheckNudge(
        { id: "x", kind: "document_stalled", related_entity_type: "document", related_entity_id: "d1", dedupe_key: null },
        state,
        NOW,
      ),
    ).toEqual({ stillTrue: false, reason: "document_moved_on" });
    expect(
      recheckNudge(
        { id: "x", kind: "document_stalled", related_entity_type: "document", related_entity_id: "d2", dedupe_key: null },
        state,
        NOW,
      ).stillTrue,
    ).toBe(true);
    expect(
      recheckNudge(
        { id: "x", kind: "document_stalled", related_entity_type: "document", related_entity_id: "d3", dedupe_key: null },
        state,
        NOW,
      ),
    ).toEqual({ stillTrue: false, reason: "document_moved_on" });
  });

  it("retires a capture nudge once it is routed", () => {
    expect(
      recheckNudge(
        { id: "x", kind: "capture_unrouted", related_entity_type: "note", related_entity_id: "n1", dedupe_key: null },
        state,
        NOW,
      ),
    ).toEqual({ stillTrue: false, reason: "capture_routed" });
    expect(
      recheckNudge(
        { id: "x", kind: "capture_unrouted", related_entity_type: "note", related_entity_id: "n2", dedupe_key: null },
        state,
        NOW,
      ).stillTrue,
    ).toBe(true);
  });
});
