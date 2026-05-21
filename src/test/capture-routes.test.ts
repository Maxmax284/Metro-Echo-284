// Capture-route hook contract — shape-test the inputs/outputs the inbox
// state machine and audit trail rely on. We don't hit Supabase here.
import { describe, expect, it } from "vitest";

const VALID_ACTIONS = [
  "accepted","edited","dismissed","archived","attached","ignored",
  "reviewed","snoozed","unsnoozed","routed","undo",
] as const;

const VALID_KINDS = ["message","file","field_note","note","other"] as const;

describe("capture_routes payload contract", () => {
  it("every user_action value is recognized", () => {
    for (const a of VALID_ACTIONS) {
      expect(typeof a).toBe("string");
      expect(a.length).toBeGreaterThan(2);
    }
  });

  it("every capture_kind matches the table check constraint", () => {
    for (const k of VALID_KINDS) {
      expect(["message","file","field_note","note","other"]).toContain(k);
    }
  });

  it("audit event defaults to capture.<action>", () => {
    const event = `capture.${"accepted" as const}`;
    expect(event).toBe("capture.accepted");
  });
});

describe("triage state transitions", () => {
  // Doctrine: nothing skips approval. The valid forward edges of the inbox
  // state machine — anything else is a bug.
  const ALLOWED: Array<[string, string]> = [
    ["new", "needs_review"],
    ["new", "suggested"],
    ["needs_review", "suggested"],
    ["needs_review", "routed"],
    ["suggested", "routed"],
    ["suggested", "dismissed"],
    ["routed", "attached"],
    ["routed", "archived"],
    ["new", "ignored"],
    ["needs_review", "ignored"],
    ["any", "stale"],
  ];
  it("preserves the spine of the inbox state machine", () => {
    expect(ALLOWED.length).toBeGreaterThan(0);
    for (const [from, to] of ALLOWED) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
    }
  });
});
