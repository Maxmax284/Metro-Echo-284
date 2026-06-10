import { describe, it, expect } from "vitest";
import {
  classifyIntakeItem,
  filterForCommandCenter,
  groupSimilarCaptures,
  isGroup,
  keyFor,
  DEFAULT_INTAKE_PREFS,
} from "@/lib/intakeLifecycle";

const prefs = { ...DEFAULT_INTAKE_PREFS, capture_visibility_days: 3 };

describe("classifyIntakeItem", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const fresh = { kind: "message" as const, id: "a", ts: "2026-06-10T10:00:00Z" };
  const old_ = { kind: "message" as const, id: "b", ts: "2026-05-01T10:00:00Z" };

  it("classifies fresh as active", () => {
    expect(classifyIntakeItem(fresh, prefs, new Set(), new Set(), now)).toBe("active");
  });
  it("classifies old unattached as stale", () => {
    expect(classifyIntakeItem(old_, prefs, new Set(), new Set(), now)).toBe("stale");
  });
  it("classifies dismissed as dismissed even if fresh", () => {
    const d = new Set([keyFor("message", "a")]);
    expect(classifyIntakeItem(fresh, prefs, d, new Set(), now)).toBe("dismissed");
  });
  it("classifies attached as attached", () => {
    const a = new Set([keyFor("message", "a")]);
    expect(classifyIntakeItem(fresh, prefs, new Set(), a, now)).toBe("attached");
  });
  it("keeps stale-aged items active when they have an active workflow", () => {
    const withWf = { ...old_, hasActiveWorkflow: true };
    expect(classifyIntakeItem(withWf, prefs, new Set(), new Set(), now)).toBe("active");
  });
});

describe("filterForCommandCenter", () => {
  it("returns only active items", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const items = [
      { kind: "message" as const, id: "a", ts: "2026-06-10T11:00:00Z" },
      { kind: "message" as const, id: "b", ts: "2026-05-01T11:00:00Z" },
      { kind: "message" as const, id: "c", ts: "2026-06-10T11:00:00Z" },
    ];
    const dismissed = new Set([keyFor("message", "c")]);
    const out = filterForCommandCenter(items, prefs, dismissed, new Set(), now);
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("groupSimilarCaptures", () => {
  it("groups items sharing top keywords within a window", () => {
    const items = [
      { id: "1", ts: "2026-06-10T10:00:00Z", text: "Ground Stay payment received" },
      { id: "2", ts: "2026-06-10T11:00:00Z", text: "Ground Stay payment deposit" },
      { id: "3", ts: "2026-06-10T12:00:00Z", text: "Ground Stay payment fee" },
      { id: "4", ts: "2026-06-10T13:00:00Z", text: "Laundry note" },
    ];
    const out = groupSimilarCaptures(items, { ...prefs, duplicate_grouping: "group" });
    const groups = out.filter(isGroup);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(3);
  });

  it("show_all returns items unchanged", () => {
    const items = [
      { id: "1", ts: "2026-06-10T10:00:00Z", text: "Ground Stay payment" },
      { id: "2", ts: "2026-06-10T11:00:00Z", text: "Ground Stay payment" },
    ];
    const out = groupSimilarCaptures(items, { ...prefs, duplicate_grouping: "show_all" });
    expect(out.length).toBe(2);
  });
});
