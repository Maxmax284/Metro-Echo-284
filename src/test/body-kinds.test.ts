// What the phone hand-off will and will not take, and why.
import { describe, expect, it } from "vitest";
import { acceptReadings, groupAllowed, refusalWords, specFor } from "@/lib/bodyKinds";

const ALL = { body_basics: true, activity: true, sleep: true };

describe("specFor", () => {
  it("takes Echo's own names", () => {
    expect(specFor("resting_heart_rate")?.kind).toBe("resting_heart_rate");
    expect(specFor("steps")?.group).toBe("activity");
  });

  it("translates what phones actually call things", () => {
    expect(specFor("heart_rate_variability")?.kind).toBe("hrv");
    expect(specFor("Oxygen Saturation")?.kind).toBe("spo2");
    expect(specFor("step_count")?.kind).toBe("steps");
    expect(specFor("Active Energy")?.kind).toBe("calories");
    expect(specFor("sleep_analysis")?.kind).toBe("sleep");
  });

  it("refuses a name it does not know rather than guessing", () => {
    expect(specFor("mood_score")).toBeNull();
    expect(specFor("")).toBeNull();
  });
});

describe("groupAllowed", () => {
  it("absent consent means off", () => {
    expect(groupAllowed("activity", {})).toBe(false);
    expect(groupAllowed("sleep", undefined)).toBe(false);
  });

  it("an explicit group setting wins", () => {
    expect(groupAllowed("sleep", { sleep: false, activity: true })).toBe(false);
    expect(groupAllowed("sleep", { sleep: true })).toBe(true);
  });

  it("older accounts keep working from the switch they already had", () => {
    expect(groupAllowed("activity", { activity: true })).toBe(true);
    expect(groupAllowed("body_basics", { heart_rate: true })).toBe(true);
    expect(groupAllowed("body_basics", { heart_rate: false, activity: true })).toBe(false);
  });
});

describe("acceptReadings", () => {
  it("stores what it recognises and says why it refused the rest", () => {
    const { accepted, refused } = acceptReadings(
      [
        { kind: "hrv", value: 66, measured_at: "2026-09-17T06:00:00Z" },
        { kind: "mood_score", value: 3 },
        { kind: "steps", value: "not a number" },
      ],
      ALL,
    );
    expect(accepted.map((r) => r.kind)).toEqual(["hrv"]);
    expect(accepted[0].unit).toBe("ms");
    expect(refused.map((r) => r.why)).toEqual(["unknown_kind", "not_a_number"]);
    expect(refusalWords(refused)).toContain("mood_score");
  });

  it("keeps sleep in minutes whichever way the phone sends it", () => {
    const { accepted } = acceptReadings(
      [
        { kind: "sleep", value: 7.5, unit: "hours" },
        { kind: "sleep_minutes", value: 431, unit: "min" },
      ],
      ALL,
    );
    expect(accepted[0]).toMatchObject({ kind: "sleep", value: 450, unit: "min" });
    expect(accepted[1].value).toBe(431);
  });

  it("a switched-off group stores nothing from that group", () => {
    const { accepted, refused } = acceptReadings(
      [
        { kind: "sleep", value: 400 },
        { kind: "steps", value: 8000 },
      ],
      { activity: true, sleep: false },
    );
    expect(accepted.map((r) => r.kind)).toEqual(["steps"]);
    expect(refused).toEqual([{ name: "sleep", why: "switched_off" }]);
    expect(refusalWords(refused)).toContain("switched off");
  });

  it("nothing recognised means nothing accepted, never a filled-in zero", () => {
    const { accepted } = acceptReadings([{ kind: "vibes", value: 9 }], ALL);
    expect(accepted).toEqual([]);
  });
});
