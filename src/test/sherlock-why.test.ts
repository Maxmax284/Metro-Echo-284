import { describe, expect, it } from "vitest";
import { explainFinding } from "@/lib/sherlockWhy";
import type { SherlockFinding } from "@/lib/sherlock/types";

function f(over: Partial<SherlockFinding> = {}): SherlockFinding {
  return {
    id: "1", user_id: "u",
    source_object_id: null, source_object_type: "note",
    mode: "observe", finding_type: "recurring_entity",
    summary: "s", extracted_data: {}, suggested_action: null,
    suggested_relation_type: null, target_object_id: null, target_object_type: null,
    confidence: "medium", rationale: null, status: "pending",
    surface_origin: "patterns", sensitive_flag: false, cooldown_until: null,
    reviewed_at: null, reviewed_by: null, audit_event_id: null, evidence_hash: null,
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
    ...over,
  } as SherlockFinding;
}

describe("explainFinding", () => {
  it("says it is thin when nothing was recorded", () => {
    const why = explainFinding(f({ extracted_data: {}, rationale: null }));
    expect(why.thin).toBe(true);
    expect(why.signals).toHaveLength(0);
    expect(why.closing).toContain("Nothing else was recorded");
  });

  it("falls back to the scanner's own rationale as a recorded line", () => {
    const why = explainFinding(f({ rationale: "Recurring across your captures." }));
    expect(why.thin).toBe(false);
    expect(why.signals[0]).toMatchObject({ from: "the scan that found it" });
  });

  it("names the calendar and the commitment for a collision", () => {
    const why = explainFinding(
      f({
        finding_type: "promise_collides_with_meeting",
        confidence: "high",
        extracted_data: { due_at: "2026-08-14T17:00:00Z", meeting_starts_at: "2026-08-14T16:30:00Z" },
      }),
    );
    expect(why.signals).toHaveLength(2);
    expect(why.signals[1].from).toContain("calendar");
    expect(why.confidenceLine).toContain("Certain");
  });

  it("never renders a missing field", () => {
    const why = explainFinding(
      f({ finding_type: "stale_commitment", extracted_data: { due_at: "2026-08-01T09:00:00Z" } }),
    );
    expect(why.signals).toHaveLength(1);
    expect(why.signals[0].text).toContain("You promised this by");
  });

  it("drops junk values instead of printing them raw", () => {
    const why = explainFinding(
      f({ finding_type: "recurring_entity", extracted_data: { mention_count: "lots", kind: "" } }),
    );
    expect(why.signals).toHaveLength(0);
  });

  it("words confidence, never a number", () => {
    for (const c of ["high", "medium", "low"] as const) {
      const line = explainFinding(f({ confidence: c })).confidenceLine;
      expect(line).not.toMatch(/\d/);
    }
  });
});
