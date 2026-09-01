import { describe, expect, it } from "vitest";
import {
  buildPromiseWalk,
  describeSweep,
  walkProgress,
  type LoopFacts,
} from "@/lib/physicalLoop";

const EMPTY: LoopFacts = {
  linked: false,
  lastMessageAt: null,
  promise: null,
  reminderSentAt: null,
  closedFromChat: false,
};

describe("physical loop walk", () => {
  it("waits on every step when nothing has happened", () => {
    const steps = buildPromiseWalk(EMPTY);
    expect(steps).toHaveLength(5);
    expect(walkProgress(steps)).toEqual({ done: 0, total: 5 });
    expect(steps[0].line).toContain("No chat linked");
  });

  it("marks only the steps records prove", () => {
    const steps = buildPromiseWalk({
      linked: true,
      lastMessageAt: "2 hours ago",
      promise: { id: "c1", summary: "Send Nikki the schedule", status: "open" },
      reminderSentAt: null,
      closedFromChat: false,
    });
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "waiting", "waiting", "waiting"]);
    expect(steps[4].line).toContain('"open"');
  });

  it("closes the loop only when the promise reads done", () => {
    const steps = buildPromiseWalk({
      linked: true,
      lastMessageAt: "yesterday",
      promise: { id: "c1", summary: "Call the landlord", status: "done" },
      reminderSentAt: "an hour ago",
      closedFromChat: true,
    });
    expect(walkProgress(steps)).toEqual({ done: 5, total: 5 });
  });
});

describe("sweep reporting", () => {
  it("never claims a status when it has not run", () => {
    expect(describeSweep(null, 0)).toContain("has not read any pages");
    expect(describeSweep(null, 2)).toContain("2 pages are waiting");
  });

  it("reports a diff, including an empty one", () => {
    expect(describeSweep({ at: "x", read: 0, unreadable: 0, scanned: 0 }, 0)).toBe(
      "nothing new to read.",
    );
    expect(describeSweep({ at: "x", read: 3, unreadable: 1, scanned: 4 }, 2)).toBe(
      "3 pages read, 1 unreadable. 2 still waiting.",
    );
  });
});
