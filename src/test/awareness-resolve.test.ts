// Resolution recheck: a note dies the moment its situation gets handled.
import { describe, expect, it } from "vitest";
import { recheckNudge, retireResolved, type EntityState, type PendingNudge } from "@/lib/awareness";

const NOW = new Date("2026-08-19T04:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString();

const nudge = (over: Partial<PendingNudge> = {}): PendingNudge => ({
  id: "n1",
  kind: "commitment_drifting",
  related_entity_type: "commitment",
  related_entity_id: "c1",
  dedupe_key: "commitment_drifting:c1",
  expires_at: null,
  ...over,
});

const state = (over: Partial<EntityState> = {}): EntityState => ({
  commitments: { c1: "open" },
  actions: { a1: "staged" },
  projects: { p1: daysAgo(30) },
  ...over,
});

describe("recheckNudge", () => {
  it("keeps a note whose situation is still true", () => {
    expect(recheckNudge(nudge(), state(), NOW).stillTrue).toBe(true);
  });

  it("retires a closed commitment", () => {
    for (const status of ["done", "cancelled"]) {
      const v = recheckNudge(nudge(), state({ commitments: { c1: status } }), NOW);
      expect(v).toEqual({ stillTrue: false, reason: "commitment_closed" });
    }
  });

  it("retires an action the human already moved on", () => {
    const n = nudge({ kind: "action_awaiting_approval", related_entity_type: "action", related_entity_id: "a1" });
    expect(recheckNudge(n, state({ actions: { a1: "executed" } }), NOW))
      .toEqual({ stillTrue: false, reason: "action_moved_on" });
    expect(recheckNudge(n, state({ actions: { a1: "staged" } }), NOW).stillTrue).toBe(true);
  });

  it("names a reviewed risk for what it is", () => {
    const n = nudge({ kind: "risk_unread", related_entity_type: "action", related_entity_id: "a1" });
    expect(recheckNudge(n, state({ actions: { a1: "approved" } }), NOW))
      .toEqual({ stillTrue: false, reason: "risk_reviewed" });
  });

  it("stops calling a project silent once it moves again", () => {
    const n = nudge({ kind: "project_went_silent", related_entity_type: "project", related_entity_id: "p1" });
    expect(recheckNudge(n, state({ projects: { p1: daysAgo(1) } }), NOW))
      .toEqual({ stillTrue: false, reason: "project_active_again" });
    expect(recheckNudge(n, state(), NOW).stillTrue).toBe(true);
  });

  it("treats a row it can no longer see in scope as gone", () => {
    expect(recheckNudge(nudge(), state({ commitments: {} }), NOW))
      .toEqual({ stillTrue: false, reason: "entity_gone" });
  });

  it("retires anything past its expiry", () => {
    expect(recheckNudge(nudge({ expires_at: daysAgo(1) }), state(), NOW))
      .toEqual({ stillTrue: false, reason: "expired" });
  });

  it("leaves a note with no entity reference alone", () => {
    expect(recheckNudge(nudge({ related_entity_type: null, related_entity_id: null }), state(), NOW).stillTrue)
      .toBe(true);
  });
});

describe("retireResolved", () => {
  it("returns only the notes that stopped being true", () => {
    const out = retireResolved(
      [
        nudge({ id: "keep" }),
        nudge({ id: "drop", related_entity_id: "c2" }),
        nudge({ id: "done-action", related_entity_type: "action", related_entity_id: "a1", kind: "risk_unread" }),
      ],
      state({ commitments: { c1: "open" }, actions: { a1: "rolled_back" } }),
      NOW,
    );
    expect(out.map((r) => r.id)).toEqual(["drop", "done-action"]);
    expect(out[1].reason).toBe("risk_reviewed");
  });

  it("says nothing when everything is still true", () => {
    expect(retireResolved([nudge()], state(), NOW)).toEqual([]);
  });
});
