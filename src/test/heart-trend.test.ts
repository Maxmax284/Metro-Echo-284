// Heart, one level per day, from recorded readings only.
import { describe, expect, it } from "vitest";
import { heartByDay, heartCompare, type Reading } from "@/lib/wearable";

const NOW = new Date("2026-09-17T18:00:00Z");
const at = (daysAgo: number, hour = 9) =>
  new Date(Date.UTC(2026, 8, 17 - daysAgo, hour)).toISOString();

const r = (kind: Reading["kind"], value: number, daysAgo: number, hour = 9): Reading => ({
  kind,
  value,
  unit: "bpm",
  measured_at: at(daysAgo, hour),
  source: "ingest",
});

describe("heartByDay", () => {
  it("leaves a day with nothing recorded as a gap, never a zero", () => {
    const levels = heartByDay([r("heart_rate", 60, 0)], 3, NOW);
    expect(levels).toEqual([null, null, 60]);
  });

  it("takes the middle of a day rather than the spike", () => {
    const levels = heartByDay(
      [r("heart_rate", 58, 0, 7), r("heart_rate", 62, 0, 12), r("heart_rate", 160, 0, 18)],
      1,
      NOW,
    );
    expect(levels).toEqual([62]);
  });

  it("counts resting readings alongside ordinary ones and ignores other kinds", () => {
    const levels = heartByDay(
      [r("resting_heart_rate", 54, 0), { ...r("heart_rate", 999, 0), kind: "steps" }],
      1,
      NOW,
    );
    expect(levels).toEqual([54]);
  });
});

describe("heartCompare", () => {
  it("says nothing arrived when nothing did", () => {
    expect(heartCompare([null, null])).toMatch(/no heart reading/i);
  });

  it("waits for enough days before claiming a usual", () => {
    expect(heartCompare([null, 61, 60])).toMatch(/not enough days/i);
  });

  it("calls a small wobble about the same", () => {
    expect(heartCompare([60, 61, 62, 61])).toMatch(/about your usual/i);
  });

  it("names a real move without judging it", () => {
    const line = heartCompare([60, 61, 62, 78]);
    expect(line).toMatch(/above your usual/);
    expect(line).not.toMatch(/high|bad|should|worry/i);
  });
});
