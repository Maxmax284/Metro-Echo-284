import { describe, expect, it } from "vitest";
import { buildSherlockBriefing, groupNoticed, pickStartHere } from "@/lib/sherlockBriefing";
import type { SherlockFinding } from "@/lib/sherlock/types";

function f(over: Partial<SherlockFinding> = {}): SherlockFinding {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    user_id: "u",
    source_object_id: null,
    source_object_type: "note",
    mode: "observe",
    finding_type: "recurring_entity",
    summary: "something",
    extracted_data: {},
    suggested_action: null,
    suggested_relation_type: null,
    target_object_id: null,
    target_object_type: null,
    confidence: "medium",
    rationale: null,
    status: "pending",
    surface_origin: "patterns",
    sensitive_flag: false,
    cooldown_until: null,
    reviewed_at: null,
    reviewed_by: null,
    audit_event_id: null,
    evidence_hash: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  } as SherlockFinding;
}

describe("sherlock briefing", () => {
  it("says nothing is filed and stays calm on an empty queue", () => {
    const b = buildSherlockBriefing({ pending: [] });
    expect(b.calm).toBe(true);
    expect(b.startHere).toBeNull();
    expect(b.groups).toHaveLength(0);
  });

  it("never promotes a sensitive finding", () => {
    const top = pickStartHere([f({ confidence: "high", sensitive_flag: true })]);
    expect(top).toBeNull();
  });

  it("never promotes low confidence", () => {
    expect(pickStartHere([f({ confidence: "low" })])).toBeNull();
  });

  it("promotes exactly one, highest confidence then newest", () => {
    const chosen = pickStartHere([
      f({ id: "a", confidence: "medium", updated_at: "2026-08-05T00:00:00Z" }),
      f({ id: "b", confidence: "high", updated_at: "2026-08-02T00:00:00Z" }),
      f({ id: "c", confidence: "high", updated_at: "2026-08-04T00:00:00Z" }),
    ]);
    expect(chosen?.id).toBe("c");
  });

  it("groups by mode with a real example and counts", () => {
    const groups = groupNoticed([
      f({ mode: "relate", summary: "older", updated_at: "2026-08-01T00:00:00Z" }),
      f({ mode: "relate", summary: "newest", updated_at: "2026-08-09T00:00:00Z" }),
      f({ mode: "observe", summary: "pattern" }),
    ]);
    expect(groups[0]).toMatchObject({ key: "relate", count: 2, example: "newest" });
    expect(groups[1].count).toBe(1);
  });

  it("counts sensitive findings in the headline without promoting them", () => {
    const b = buildSherlockBriefing({
      pending: [f({ sensitive_flag: true, confidence: "high" }), f({ confidence: "high" })],
    });
    expect(b.headline).toContain("1 marked sensitive");
    expect(b.headline).toContain("Nothing has been filed");
    expect(b.startHere?.sensitive_flag).toBe(false);
  });
});
