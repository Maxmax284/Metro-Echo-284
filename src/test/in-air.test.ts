import { describe, expect, it } from "vitest";
import { cabinRead, inAirRead, instantAlong } from "@/lib/inAir";

const DEP = "2026-09-19T05:15:00.000Z"; // IAD 01:15 EDT
const ARR = "2026-09-19T21:10:00.000Z"; // TPE 05:10 next day local

describe("inAirRead", () => {
  it("measures the great circle between two kept airports", () => {
    const r = inAirRead({ fromIata: "IAD", toIata: "TPE", departAt: DEP, arriveAt: ARR, now: new Date(DEP) });
    expect(r.totalMi).toBeGreaterThan(7000);
    expect(r.totalMi).toBeLessThan(8200);
    expect(r.progress).toBe(0);
    expect(r.toGoMi).toBe(r.totalMi);
  });

  it("moves miles to landing and time left on the clock", () => {
    const half = new Date((Date.parse(DEP) + Date.parse(ARR)) / 2);
    const r = inAirRead({ fromIata: "IAD", toIata: "TPE", departAt: DEP, arriveAt: ARR, now: half });
    expect(r.progress).toBeCloseTo(0.5, 2);
    expect(r.toGoMi).toBeCloseTo((r.totalMi ?? 0) / 2, -1);
    expect(r.source).toBe("clock");
    expect(r.leftWords).toBe("7h 57m left");
  });

  it("never runs time left below zero", () => {
    const late = new Date(Date.parse(ARR) + 3 * 3600_000);
    const r = inAirRead({ fromIata: "IAD", toIata: "TPE", departAt: DEP, arriveAt: ARR, now: late });
    expect(r.minsLeft).toBe(0);
    expect(r.leftWords).toBe("landing now");
    expect(r.toGoMi).toBe(0);
  });

  it("invents no distance for an airport it does not keep", () => {
    const r = inAirRead({ fromIata: "ZZZ", toIata: "TPE", departAt: DEP, arriveAt: ARR, now: new Date(DEP) });
    expect(r.totalMi).toBeNull();
    expect(r.toGoMi).toBeNull();
  });

  it("has no progress without both times", () => {
    const r = inAirRead({ fromIata: "IAD", toIata: "TPE", departAt: DEP, arriveAt: null, now: new Date(DEP) });
    expect(r.progress).toBeNull();
    expect(r.source).toBe("none");
    expect(r.leftWords).toBeNull();
  });
});

describe("instantAlong", () => {
  it("reads the instant at a fraction of the track", () => {
    const at = instantAlong(DEP, ARR);
    expect(at(0)).toBe(new Date(DEP).toISOString());
    expect(at(1)).toBe(new Date(ARR).toISOString());
    expect(instantAlong(DEP, null)(0.5)).toBeNull();
  });
});

describe("cabinRead", () => {
  it("labels long-haul power and Wi-Fi as usual practice, not a reading", () => {
    const c = cabinRead(7800);
    expect(c.power).toBe("USUALLY AT THE SEAT");
    expect(c.wifi).toBe("USUALLY PAID");
    expect(c.caveat).toContain("not a reading off this one");
  });

  it("claims nothing on a short hop or an unknown distance", () => {
    expect(cabinRead(400).power).toBe("NOT ON RECORD");
    expect(cabinRead(null).wifi).toBe("NOT ON RECORD");
  });
});
