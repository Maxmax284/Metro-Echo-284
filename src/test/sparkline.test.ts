import { describe, expect, it } from "vitest";
import { bucketByDay, isFlat, sparklinePath } from "@/lib/sparkline";

/* The activity trace is data-as-decoration: it is only allowed to look busy
   when something was actually recorded. These tests pin that honesty. */

const DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number, now: number): string {
  // Midday offset so local-midnight bucketing is unambiguous.
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  return new Date(start.getTime() - days * DAY).toISOString();
}

describe("bucketByDay", () => {
  const now = new Date("2026-08-14T10:00:00Z").getTime();

  it("returns one bucket per day, oldest first", () => {
    expect(bucketByDay([], 14, now)).toHaveLength(14);
  });

  it("counts nothing when there are no timestamps", () => {
    expect(isFlat(bucketByDay([], 14, now))).toBe(true);
  });

  it("puts today's activity in the last bucket", () => {
    const b = bucketByDay([isoDaysAgo(0, now)], 7, now);
    expect(b[6]).toBe(1);
    expect(b.slice(0, 6).every((v) => v === 0)).toBe(true);
  });

  it("puts yesterday's activity one bucket earlier", () => {
    const b = bucketByDay([isoDaysAgo(1, now)], 7, now);
    expect(b[5]).toBe(1);
    expect(b[6]).toBe(0);
  });

  it("drops rows older than the window instead of clamping them", () => {
    const b = bucketByDay([isoDaysAgo(40, now)], 14, now);
    expect(isFlat(b)).toBe(true);
  });

  it("ignores null, undefined and unparseable values", () => {
    const b = bucketByDay([null, undefined, "not-a-date"], 7, now);
    expect(isFlat(b)).toBe(true);
  });

  it("accumulates multiple rows on the same day", () => {
    const b = bucketByDay([isoDaysAgo(2, now), isoDaysAgo(2, now), isoDaysAgo(2, now)], 7, now);
    expect(b[4]).toBe(3);
  });
});

describe("sparklinePath", () => {
  it("returns nothing for an empty series", () => {
    expect(sparklinePath([])).toBe("");
  });

  it("draws a flat mid-line for a single value", () => {
    expect(sparklinePath([3], 64, 16)).toBe("M 0 8.00 L 64 8.00");
  });

  it("draws a flat bottom line when nothing was recorded", () => {
    const d = sparklinePath([0, 0, 0], 64, 16);
    // All points sit on the baseline, never mid-height, so quiet reads quiet.
    expect(d).toBe("M 0.00 15.00 L 32.00 15.00 L 64.00 15.00");
  });

  it("scales the peak to the top of the box with 1px headroom", () => {
    const d = sparklinePath([0, 5], 64, 16);
    expect(d).toBe("M 0.00 15.00 L 64.00 1.00");
  });

  it("spans the full width regardless of series length", () => {
    const d = sparklinePath([1, 2, 3, 4, 5], 100, 20);
    expect(d.startsWith("M 0.00")).toBe(true);
    expect(d).toContain("L 100.00");
  });
});
