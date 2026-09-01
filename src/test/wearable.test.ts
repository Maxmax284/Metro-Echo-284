import { describe, expect, it } from "vitest";
import {
  bodySummary,
  buildWearableWalk,
  describeWearableSweep,
  readingLine,
  stepsForDay,
  suggestPosture,
  walkProgress,
  type Reading,
} from "@/lib/wearable";

const now = new Date().toISOString();
const hr = (v: number, at = now): Reading => ({
  kind: "heart_rate",
  value: v,
  unit: "bpm",
  measured_at: at,
  source: "bluetooth",
});

describe("readings", () => {
  it("says off rather than empty when a sense is off", () => {
    expect(readingLine("heart_rate", null, false)).toContain("Switched off");
  });

  it("never invents a number", () => {
    expect(readingLine("steps", null, true)).toContain("Nothing has arrived");
  });

  it("takes the highest step total for a day", () => {
    const day = new Date();
    const rows: Reading[] = [
      { kind: "steps", value: 400, unit: "steps", measured_at: day.toISOString(), source: "ingest" },
      { kind: "steps", value: 1412, unit: "steps", measured_at: day.toISOString(), source: "ingest" },
    ];
    expect(stepsForDay(rows, day)).toBe(1412);
  });
});

describe("sweep reporting", () => {
  it("has no status to claim before it runs", () => {
    expect(describeWearableSweep(null)).toContain("has not read your watch");
  });

  it("reports a diff, including an empty one", () => {
    expect(describeWearableSweep({ at: "x", heart_rate: 0, steps: 0, sleep: 0, workout: 0 })).toBe(
      "nothing new from your watch.",
    );
    expect(describeWearableSweep({ at: "x", heart_rate: 22, steps: 3, sleep: 1, workout: 0 })).toBe(
      "3 step records, 22 heart-rate readings, 1 sleep record.",
    );
  });
});

describe("posture suggestions", () => {
  it("stays quiet without consent", () => {
    expect(suggestPosture("at_desk", hr(150), false)).toBeNull();
  });

  it("suggests training when the numbers disagree loudly", () => {
    expect(suggestPosture("at_desk", hr(150), true)?.posture).toBe("training");
  });

  it("ignores stale readings", () => {
    const old = new Date(Date.now() - 5 * 60 * 60_000).toISOString();
    expect(suggestPosture("at_desk", hr(150, old), true)).toBeNull();
  });
});

describe("wearable walk", () => {
  it("proves nothing when nothing is on", () => {
    const steps = buildWearableWalk({
      anySensorOn: false,
      readings: [],
      posture: null,
      sweep: null,
      postureActedAt: null,
    });
    expect(walkProgress(steps)).toEqual({ done: 0, total: 5 });
  });

  it("closes only when readings, posture and an adjustment all exist", () => {
    const steps = buildWearableWalk({
      anySensorOn: true,
      readings: [hr(72)],
      posture: "at_desk",
      sweep: null,
      postureActedAt: now,
    });
    expect(walkProgress(steps)).toEqual({ done: 5, total: 5 });
  });

  it("summarises the Today line from real numbers only", () => {
    expect(
      bodySummary({ anySensorOn: false, readings: [], posture: null, sweep: null, postureActedAt: null }),
    ).toContain("nothing switched on");
    expect(
      bodySummary({ anySensorOn: true, readings: [hr(72)], posture: "quiet", sweep: null, postureActedAt: null }),
    ).toBe("Your body · 72 bpm · posture set");
  });
});
