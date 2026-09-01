import { describe, expect, it } from "vitest";
import {
  bodySummary,
  buildWearableWalk,
  describeWearableSweep,
  readingLine,
  stepsForDay,
  stepsByDay,
  stepsMedian,
  stepsCompare,
  heartSeries,
  workBodyContext,
  suggestPosture,
  walkProgress,
  type Reading,
} from "@/lib/wearable";
import { sleepByDay, sleepCompare, formatMinutes, restBalance, bodyCompare } from "@/lib/wearable";

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

describe("watch trends", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 8, 1) - n * 86_400_000).toISOString();
  const r = (kind: any, value: number, at: string, source: any = "ingest") => ({
    kind, value, unit: "", measured_at: at, source,
  });
  const now = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));

  it("shows a missing day as a gap, never a zero", () => {
    const buckets = stepsByDay([r("steps", 8000, day(0)), r("steps", 6000, day(2))], 4, now);
    expect(buckets).toHaveLength(4);
    expect(buckets[buckets.length - 1].steps).toBe(8000);
    expect(buckets.find((b) => b.steps === 0)).toBeUndefined();
    expect(buckets.filter((b) => b.steps === null)).toHaveLength(2);
  });

  it("takes the highest step total per day", () => {
    const buckets = stepsByDay([r("steps", 300, day(0)), r("steps", 9100, day(0))], 1, now);
    expect(buckets[0].steps).toBe(9100);
  });

  it("medians recorded days only and excludes today", () => {
    const buckets = stepsByDay(
      [r("steps", 100000, day(0)), r("steps", 4000, day(1)), r("steps", 6000, day(2))],
      3,
      now,
    );
    expect(stepsMedian(buckets, now)).toBe(5000);
  });

  it("keeps quiet about comparisons with no history", () => {
    expect(stepsCompare(stepsByDay([], 3, now), now)).toMatch(/nothing to compare/i);
  });

  it("orders heart readings oldest first inside the window", () => {
    const pts = heartSeries(
      [r("heart_rate", 60, new Date(now.getTime() - 3600_000).toISOString()),
       r("heart_rate", 130, new Date(now.getTime() - 7200_000).toISOString()),
       r("heart_rate", 55, new Date(now.getTime() - 80 * 3600_000).toISOString())],
      48,
      now,
    );
    expect(pts.map((p) => p.value)).toEqual([130, 60]);
  });

  it("says nothing about the body when every sense is off", () => {
    const ctx = workBodyContext(
      { anySensorOn: false, readings: [r("workout", 45, now.toISOString())], posture: null, sweep: null, postureActedAt: null },
      now,
    );
    expect(ctx.line).toBeNull();
    expect(ctx.keepShort).toBe(false);
  });

  it("leads short after a recent workout and says why", () => {
    const ctx = workBodyContext(
      {
        anySensorOn: true,
        readings: [r("workout", 45, new Date(now.getTime() - 20 * 60_000).toISOString())],
        posture: null,
        sweep: null,
        postureActedAt: null,
      },
      now,
    );
    expect(ctx.keepShort).toBe(true);
    expect(ctx.because).toMatch(/trained/i);
    expect(ctx.line).toMatch(/45 min/);
  });

  it("does not lead short on a stale workout", () => {
    const ctx = workBodyContext(
      {
        anySensorOn: true,
        readings: [r("workout", 45, new Date(now.getTime() - 6 * 3600_000).toISOString())],
        posture: null,
        sweep: null,
        postureActedAt: null,
      },
      now,
    );
    expect(ctx.keepShort).toBe(false);
  });
});

describe("sleep and rest", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const rd = (kind: any, value: number, at: string) => ({
    kind,
    value,
    unit: kind === "sleep" ? "min" : "",
    measured_at: at,
    source: "ingest" as const,
  });

  it("reads a missing night as a gap, never a zero", () => {
    const nights = sleepByDay([rd("sleep", 420, "2026-08-30T06:00:00.000Z")], 3, now);
    expect(nights.map((n) => n.minutes)).toEqual([420, null, null]);
  });

  it("formats minutes plainly", () => {
    expect(formatMinutes(440)).toBe("7h 20m");
    expect(formatMinutes(45)).toBe("45m");
  });

  it("compares last night against your own nights", () => {
    const readings = [
      rd("sleep", 300, "2026-09-01T06:00:00.000Z"),
      rd("sleep", 460, "2026-08-31T06:00:00.000Z"),
      rd("sleep", 450, "2026-08-30T06:00:00.000Z"),
    ];
    const line = sleepCompare(sleepByDay(readings, 5, now), now);
    expect(line).toMatch(/less than your usual/);
  });

  it("calls short sleep plus training strained, and unknown sleep unknown", () => {
    const strained = restBalance(
      [rd("sleep", 300, "2026-09-01T06:00:00.000Z"), rd("workout", 60, "2026-09-01T07:00:00.000Z")],
      now,
    );
    expect(strained.strained).toBe(true);
    const unknown = restBalance([rd("workout", 60, "2026-09-01T07:00:00.000Z")], now);
    expect(unknown.strained).toBe(false);
    expect(unknown.line).toMatch(/rest is unknown/);
  });

  it("builds four compare rows that never invent a number", () => {
    const rows = bodyCompare([], 14, now);
    expect(rows.map((r) => r.key)).toEqual(["steps", "sleep", "heart_rate", "workout"]);
    expect(rows.every((r) => r.today === "nothing recorded")).toBe(true);
  });
});
