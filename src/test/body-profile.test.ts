// The body profile is context. It never becomes a target, a score or advice.
import { describe, expect, it } from "vitest";
import {
  bodyProfileBlock,
  bodyProfileLines,
  hasBodyProfile,
  sanitizeBodyProfile,
  trainsOn,
} from "@/lib/bodyProfile";

describe("sanitizeBodyProfile", () => {
  it("keeps what it recognises and drops the rest", () => {
    const p = sanitizeBodyProfile({
      age_band: "40s",
      height_cm: "181",
      build: "solid",
      life_mode: "athlete",
      sleep_habit: "late",
      main_activity: "Muay Thai",
      training_days: [1, 3, 3, 9, -1],
      keep_in_mind: "Old knee",
      nonsense: true,
      target_steps: 10000,
    });
    expect(p).toMatchObject({
      age_band: "40s",
      height_cm: 181,
      build: "solid",
      life_mode: "athlete",
      sleep_habit: "late",
      main_activity: "Muay Thai",
      training_days: [1, 3],
      keep_in_mind: "Old knee",
    });
    expect((p as any).target_steps).toBeUndefined();
  });

  it("refuses junk instead of coercing it into a value", () => {
    const p = sanitizeBodyProfile({ age_band: "ancient", height_cm: 12, build: "ripped" });
    expect(p.age_band).toBeUndefined();
    expect(p.height_cm).toBeUndefined();
    expect(p.build).toBeUndefined();
    expect(hasBodyProfile(p)).toBe(false);
  });

  it("nothing in, nothing out", () => {
    expect(sanitizeBodyProfile(null)).toEqual({});
    expect(bodyProfileLines(null)).toEqual([]);
    expect(bodyProfileBlock({})).toBe("");
  });
});

describe("bodyProfileLines", () => {
  it("says only what was filled in", () => {
    const lines = bodyProfileLines(sanitizeBodyProfile({ age_band: "30s", sleep_habit: "broken" }));
    expect(lines).toEqual(["30s", "Broken sleep"]);
  });
});

describe("bodyProfileBlock", () => {
  it("hands the facts over with the rule that it is not a target", () => {
    const block = bodyProfileBlock(sanitizeBodyProfile({ life_mode: "everyday", main_activity: "walking" }));
    expect(block).toContain("self-reported");
    expect(block).toContain("Everyday life · walking");
    expect(block).toMatch(/never turn it into a target/i);
  });
});

describe("trainsOn", () => {
  it("only when they said so", () => {
    const p = sanitizeBodyProfile({ training_days: [2] });
    expect(trainsOn(p, new Date("2026-09-15T09:00:00Z"))).toBe(true); // Tuesday
    expect(trainsOn(p, new Date("2026-09-16T09:00:00Z"))).toBe(false);
    expect(trainsOn(null)).toBe(false);
  });
});
