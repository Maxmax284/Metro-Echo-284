import { describe, expect, it } from "vitest";
import {
  countStationMarks,
  markDateWords,
  rotatingDial,
  stationMarks,
  wallTilt,
  type RotatingDialId,
  type StationMarkEvent,
} from "@/lib/stationMarks";

const ev = (
  event: string,
  created_at: string,
  payload: unknown = null,
  entity_id: string | null = "p1",
): StationMarkEvent => ({ entity_id, event, payload, created_at });

describe("stationMarks", () => {
  it("folds nothing from nothing", () => {
    expect(stationMarks([])).toEqual([]);
  });

  it("a pressed stamp stands, named from the payload snapshot", () => {
    const marks = stationMarks([
      ev("place.stamped", "2026-09-26T10:00:00Z", { label: "Ko Samui", stamped_at: "2026-09-26T09:58:00Z" }),
    ]);
    expect(marks).toEqual([
      { key: "place:p1", kind: "place", name: "Ko Samui", at: "2026-09-26T09:58:00Z", recordId: "p1" },
    ]);
  });

  it("a lifted stamp leaves the wall — rollback is real", () => {
    const rows = [
      ev("place.stamped", "2026-09-26T10:00:00Z", { label: "Ko Samui" }),
      ev("place.stamp_lifted", "2026-09-27T10:00:00Z"),
    ];
    expect(stationMarks(rows)).toEqual([]);
  });

  it("a re-press after a lift stands again", () => {
    const rows = [
      ev("place.stamped", "2026-09-26T10:00:00Z", { label: "Ko Samui" }),
      ev("place.stamp_lifted", "2026-09-27T10:00:00Z"),
      ev("place.stamped", "2026-09-28T10:00:00Z", { label: "Ko Samui" }),
    ];
    expect(stationMarks(rows)).toHaveLength(1);
    expect(countStationMarks(rows)).toBe(1);
  });

  it("keeps one mark per place, newest press wins", () => {
    const rows = [
      ev("place.stamped", "2026-09-26T10:00:00Z", { label: "Old name" }),
      ev("place.stamped", "2026-09-28T10:00:00Z", { label: "New name" }),
    ];
    const marks = stationMarks(rows);
    expect(marks).toHaveLength(1);
    expect(marks[0].name).toBe("New name");
  });

  it("sorts marks newest first across kinds", () => {
    const rows = [
      ev("place.stamped", "2026-09-20T10:00:00Z", { label: "Tokyo" }, "p1"),
      ev("journey.wrapped_up", "2026-09-25T10:00:00Z", { route: "IAD → USM" }, null),
      ev("place.stamped", "2026-09-27T10:00:00Z", { label: "Fairfax" }, "p2"),
    ];
    expect(stationMarks(rows).map((m) => m.name)).toEqual(["Fairfax", "IAD → USM", "Tokyo"]);
  });

  it("a missing label never invents a name", () => {
    const marks = stationMarks([ev("place.stamped", "2026-09-26T10:00:00Z", null)]);
    expect(marks[0].name).toBe("A place you stamped");
  });

  it("a stamp event with no entity id leaves no mark", () => {
    expect(stationMarks([ev("place.stamped", "2026-09-26T10:00:00Z", { label: "X" }, null)])).toEqual([]);
  });

  it("a wrapped trip stands as a journey mark", () => {
    const marks = stationMarks([ev("journey.wrapped_up", "2026-09-25T10:00:00Z", { route: "IAD → USM" }, null)]);
    expect(marks).toEqual([
      {
        key: "journey:2026-09-25T10:00:00Z",
        kind: "journey",
        name: "IAD → USM",
        at: "2026-09-25T10:00:00Z",
        recordId: null,
      },
    ]);
  });

  it("a wrap carries the journey id as the pointer to its record", () => {
    const marks = stationMarks([
      ev("journey.wrapped_up", "2026-09-25T10:00:00Z", { route: "IAD → USM", journey_id: "leg1+leg2" }, null),
    ]);
    expect(marks[0].recordId).toBe("leg1+leg2");
  });

  it("reopening lifts only the latest standing wrap", () => {
    const rows = [
      ev("journey.wrapped_up", "2026-08-01T10:00:00Z", { route: "A → B" }, null),
      ev("journey.wrapped_up", "2026-09-01T10:00:00Z", { route: "C → D" }, null),
      ev("journey.wrap_up_reopened", "2026-09-02T10:00:00Z", null, null),
    ];
    const marks = stationMarks(rows);
    expect(marks).toHaveLength(1);
    expect(marks[0].name).toBe("A → B");
  });

  it("a wrapped trip without a route says what it is, not a guess", () => {
    const marks = stationMarks([ev("journey.wrapped_up", "2026-09-25T10:00:00Z", null, null)]);
    expect(marks[0].name).toBe("A trip you closed");
  });
});

describe("rotatingDial", () => {
  const ALL: RotatingDialId[] = ["travel", "clock", "marks"];

  it("is deterministic within a day", () => {
    expect(rotatingDial("2026-09-28", ALL)).toBe(rotatingDial("2026-09-28", ALL));
  });

  it("only ever picks an available dial", () => {
    for (let d = 1; d <= 31; d++) {
      const pick = rotatingDial(`2026-09-${String(d).padStart(2, "0")}`, ["travel", "marks"]);
      expect(["travel", "marks"]).toContain(pick);
    }
  });

  it("rotates through every available dial over a month", () => {
    const seen = new Set<RotatingDialId>();
    for (let d = 1; d <= 31; d++) {
      seen.add(rotatingDial(`2026-10-${String(d).padStart(2, "0")}`, ALL));
    }
    expect(seen.size).toBe(3);
  });

  it("falls back to travel when nothing is available", () => {
    expect(rotatingDial("2026-09-28", [])).toBe("travel");
  });
});

describe("wall dressing", () => {
  it("wallTilt stays in a hand-pressed range and is stable", () => {
    for (const key of ["place:a", "place:b", "journey:c", "place:d"]) {
      const tilt = wallTilt(key);
      expect(tilt).toBeGreaterThanOrEqual(-6);
      expect(tilt).toBeLessThanOrEqual(5);
      expect(wallTilt(key)).toBe(tilt);
    }
  });

  it("markDateWords reads like a passport stamp", () => {
    expect(markDateWords("2026-09-26T09:58:00Z")).toMatch(/26 Sep 2026/);
    expect(markDateWords("not a date")).toBe("");
  });
});
