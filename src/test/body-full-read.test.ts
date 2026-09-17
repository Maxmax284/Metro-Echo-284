// Energy, standing, weight, BMI and today's clock — recorded readings only,
// and never a verdict on any of them.
import { describe, expect, it } from "vitest";
import {
  bmiFrom,
  bmiLine,
  energyByDay,
  seriesCompare,
  standByDay,
  todayClock,
  weightMove,
  weightSeries,
  type Reading,
} from "@/lib/wearable";

const NOW = new Date("2026-09-17T18:00:00Z");
const iso = (daysAgo: number, hour = 9) =>
  new Date(Date.UTC(2026, 8, 17 - daysAgo, hour)).toISOString();

const r = (kind: Reading["kind"], value: number, daysAgo: number, hour = 9, unit = ""): Reading => ({
  kind,
  value,
  unit,
  measured_at: iso(daysAgo, hour),
  source: "ingest",
});

describe("energyByDay / standByDay", () => {
  it("leaves an empty day null rather than zero", () => {
    expect(energyByDay([r("calories", 600, 0)], 3, NOW)).toEqual([null, null, 600]);
    expect(standByDay([r("stand", 9, 1)], 3, NOW)).toEqual([null, 9, null]);
  });

  it("takes the highest of the day, because phones send running totals", () => {
    expect(energyByDay([r("calories", 200, 0, 8), r("calories", 640, 0, 18)], 1, NOW)).toEqual([640]);
  });
});

describe("seriesCompare", () => {
  it("says nothing arrived when nothing did", () => {
    expect(seriesCompare([null, null], "kcal", "No energy reading has arrived yet."))
      .toBe("No energy reading has arrived yet.");
  });

  it("waits for enough days before naming a usual", () => {
    expect(seriesCompare([null, 500, 520], "kcal", "none")).toMatch(/not enough days/i);
  });

  it("describes a move without judging it", () => {
    const line = seriesCompare([500, 520, 510, 900], "kcal", "none");
    expect(line).toMatch(/above your usual/);
    expect(line).not.toMatch(/good|great|should|bad/i);
  });
});

describe("weight", () => {
  it("reports movement across the stretch, not a judgement", () => {
    const series = weightSeries([r("weight", 79.2, 10), r("weight", 78.4, 0)], 14, NOW);
    const line = weightMove(series);
    expect(line).toMatch(/78.4 kg/);
    expect(line).toMatch(/down 0.8/);
    expect(line).not.toMatch(/good|healthy|should|overweight/i);
  });

  it("one reading means no movement claimed", () => {
    expect(weightMove(weightSeries([r("weight", 78, 0)], 14, NOW))).toMatch(/no movement/i);
  });

  it("nothing recorded stays nothing", () => {
    expect(weightMove([])).toMatch(/no weight reading/i);
  });
});

describe("bmi", () => {
  it("is arithmetic and nothing else", () => {
    expect(bmiFrom(80, 180)).toBe(24.7);
    expect(bmiFrom(60, 165)).toBe(22);
  });

  it("refuses to guess a missing height or weight", () => {
    expect(bmiFrom(80, null)).toBeNull();
    expect(bmiFrom(80, 0)).toBeNull();
    expect(bmiFrom(null, 180)).toBeNull();
  });

  it("asks for the height instead of inventing one", () => {
    const series = weightSeries([r("weight", 78, 0)], 14, NOW);
    expect(bmiLine(series, null)).toMatch(/needs your height/i);
    expect(bmiLine([], 180)).toMatch(/nothing to work it out from/i);
  });

  it("never puts a category, band or range on the figure", () => {
    const series = weightSeries([r("weight", 88, 10), r("weight", 85, 0)], 14, NOW);
    const line = bmiLine(series, 178);
    expect(line).toMatch(/26\.8/);
    expect(line).toMatch(/down 1/);
    expect(line).toMatch(/no label on it/i);
    expect(line).not.toMatch(/normal|healthy|overweight|obese|underweight|range/i);
  });
});

describe("todayClock", () => {
  it("draws nothing when nothing arrived today", () => {
    const state = todayClock([r("steps", 8000, 3)], NOW);
    expect(state.markers).toEqual([]);
    expect(state.nowPercent).toBeNull();
    expect(state.line).toMatch(/nothing has arrived today/i);
  });

  it("lays today's readings out in order and marks the newest", () => {
    const state = todayClock(
      [r("heart_rate", 61, 0, 8), r("steps", 8421, 0, 12), r("calories", 640, 0, 16)],
      NOW,
    );
    expect(state.markers.map((m) => m.kind)).toEqual(["heart_rate", "steps", "calories"]);
    expect(state.markers[0].percent).toBe(0);
    expect(state.markers[2].percent).toBe(100);
    expect(state.markers.filter((m) => m.newest)).toHaveLength(1);
    expect(state.markers[2].newest).toBe(true);
    expect(state.line).toMatch(/3 readings today/);
  });

  it("only places now when now sits inside the span", () => {
    const inside = todayClock([r("heart_rate", 60, 0, 8), r("heart_rate", 64, 0, 20)], NOW);
    expect(inside.nowPercent).not.toBeNull();
    const past = todayClock([r("heart_rate", 60, 0, 6), r("heart_rate", 64, 0, 9)], NOW);
    expect(past.nowPercent).toBeNull();
  });
});
