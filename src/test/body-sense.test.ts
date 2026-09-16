import { describe, expect, it } from "vitest";
import {
  BODY_SENSE_LAW,
  MIN_DAYS,
  bodySenseAnswer,
  compareBody,
  compareKind,
  perDay,
  type SenseReading,
} from "@/lib/bodySense";

const NOW = new Date("2026-09-16T12:00:00.000Z");

/** `daysAgo` whole days back from NOW, at midday so day keys stay stable. */
const at = (daysAgo: number) =>
  new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 11) + "12:00:00.000Z";

const rows = (kind: string, byDay: Array<[number, number[]]>): SenseReading[] =>
  byDay.flatMap(([day, vals]) => vals.map((value) => ({ kind, value, measured_at: at(day) })));

describe("bodySense — one number per day", () => {
  it("adds up a kind that accumulates over a day", () => {
    const d = perDay(rows("steps", [[1, [4000, 3000]]]), "steps");
    expect([...d.values()]).toEqual([7000]);
  });

  it("averages a kind that is a level, never sums it", () => {
    const d = perDay(rows("heart_rate", [[1, [60, 70]]]), "heart_rate");
    expect([...d.values()]).toEqual([65]);
  });

  it("ignores a reading that is not a number rather than treating it as zero", () => {
    const d = perDay(
      [{ kind: "steps", value: Number.NaN, measured_at: at(1) }, ...rows("steps", [[1, [1000]]])],
      "steps",
    );
    expect([...d.values()]).toEqual([1000]);
  });
});

describe("bodySense — usual is your own history", () => {
  const sleep = [
    ...rows("sleep_minutes", [[1, [360]], [2, [350]]]),
    ...rows("sleep_minutes", [[6, [480]], [7, [470]], [8, [490]], [9, [480]]]),
  ];

  it("says nothing when there are too few earlier days to call anything usual", () => {
    const thin = rows("sleep_minutes", [[1, [360]], [6, [480]]]);
    expect(compareKind(thin, "sleep_minutes", { now: NOW })).toBeNull();
  });

  it("reads a real drop as sleeping less, with both numbers shown", () => {
    const m = compareKind(sleep, "sleep_minutes", { now: NOW })!;
    expect(m.direction).toBe("down");
    expect(m.words).toBe("slept less");
    expect(m.recent).toBe(355);
    expect(m.usual).toBe(480);
  });

  it("treats a small wobble as about the same, not as news", () => {
    const steady = [
      ...rows("steps", [[1, [9500]]]),
      ...rows("steps", [[6, [10000]], [7, [10100]], [8, [9900]]]),
    ];
    expect(compareKind(steady, "steps", { now: NOW })!.direction).toBe("same");
  });

  it("never divides by a usual of zero", () => {
    const zero = [
      ...rows("caffeine_mg", [[1, [200]]]),
      ...rows("caffeine_mg", [[6, [0]], [7, [0]], [8, [0]]]),
    ];
    expect(compareKind(zero, "caffeine_mg", { now: NOW })).toBeNull();
  });

  it("puts the biggest move first across every kind", () => {
    const all = [
      ...sleep,
      ...rows("caffeine_mg", [[1, [400]]]),
      ...rows("caffeine_mg", [[6, [100]], [7, [100]], [8, [100]]]),
    ];
    expect(compareBody(all, { now: NOW })[0].kind).toBe("caffeine_mg");
  });
});

describe("bodySense — how it speaks", () => {
  const all = [
    ...rows("sleep_minutes", [[1, [360]], [2, [350]]]),
    ...rows("sleep_minutes", [[6, [480]], [7, [470]], [8, [490]], [9, [480]]]),
    ...rows("workout_minutes", [[1, [90]]]),
    ...rows("workout_minutes", [[6, [30]], [7, [30]], [8, [30]]]),
  ];

  it("says it has no usual yet instead of comparing against nothing", () => {
    const text = bodySenseAnswer(rows("steps", [[1, [1000]]]), { now: NOW });
    expect(text).toContain(`at least ${MIN_DAYS} earlier days`);
  });

  it("names the moves in plain words", () => {
    const text = bodySenseAnswer(all, { now: NOW });
    expect(text).toContain("slept less");
    expect(text).toContain("trained harder");
  });

  it("says whose usual it is, so nothing reads as a published ideal", () => {
    expect(bodySenseAnswer(all, { now: NOW })).toContain("your own last");
  });

  it("carries the no-diagnosis line on every answer", () => {
    expect(bodySenseAnswer(all, { now: NOW })).toContain("not read them as a diagnosis");
    expect(bodySenseAnswer([], { now: NOW })).toContain("not read them as a diagnosis");
  });

  it("never tells the person what to do about it", () => {
    const text = bodySenseAnswer(all, { now: NOW }).toLowerCase();
    expect(text).not.toContain("you should");
    expect(text).not.toContain("try to");
    expect(BODY_SENSE_LAW.toLowerCase()).toContain("does not judge");
  });
});
