import { beforeEach, describe, expect, it } from "vitest";
import { deriveRoomSignals, discoveryKey, discoveryWasSeen, markDiscoverySeen } from "@/lib/roomSignals";

describe("room signals", () => {
  beforeEach(() => localStorage.clear());

  it("keeps useful context cyan and needs-you amber", () => {
    const signals = deriveRoomSignals({
      nudges: [{ id: "n1", kind: "journey_moved", title: "Gate changed", priority: 80, related_entity_type: "flight", related_entity_id: "f1", dedupe_key: "gate:64", status: "pending" }],
      actions: [],
      askContext: { label: "Tokyo context is ready" },
    });
    expect(signals.today?.tone).toBe("attention");
    expect(signals.ask?.tone).toBe("context");
  });

  it("reserves red for the existing critical threshold", () => {
    const signals = deriveRoomSignals({
      nudges: [{ id: "n1", kind: "security_event", title: "Critical", priority: 95, related_entity_type: null, related_entity_id: null, dedupe_key: "c", status: "pending" }],
      actions: [],
    });
    expect(signals.today?.tone).toBe("critical");
  });

  it("clears acknowledged nudges and points work at the exact action desk", () => {
    const signals = deriveRoomSignals({
      nudges: [{ id: "n1", kind: "x", title: "Seen", priority: 80, related_entity_type: null, related_entity_id: null, dedupe_key: "x", status: "seen" }],
      actions: [{ id: "a1", title: "Review draft", status: "staged" }],
    });
    expect(signals.today).toBeUndefined();
    expect(signals.work).toMatchObject({ target: "actions", situationId: "a1" });
  });

  it("suppresses a discovery bubble after it is seen", () => {
    const key = discoveryKey("ask-context", "Tokyo");
    expect(discoveryWasSeen(localStorage, key)).toBe(false);
    markDiscoverySeen(localStorage, key);
    expect(discoveryWasSeen(localStorage, key)).toBe(true);
  });

  it("keeps new context as a one-shot state rather than a permanent count", () => {
    const signals = deriveRoomSignals({ nudges: [], actions: [], askContext: { label: "Context ready", fresh: true } });
    expect(signals.ask).toMatchObject({ tone: "context", fresh: true });
  });
});