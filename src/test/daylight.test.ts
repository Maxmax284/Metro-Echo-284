import { describe, expect, it } from "vitest";
import { daypartFor, lightPosition } from "@/lib/daylight";

describe("daylight", () => {
  it("names the part of the day from the local hour", () => {
    expect(daypartFor(2)).toBe("night");
    expect(daypartFor(6)).toBe("dawn");
    expect(daypartFor(12)).toBe("day");
    expect(daypartFor(17)).toBe("golden");
    expect(daypartFor(19.5)).toBe("dusk");
    expect(daypartFor(22)).toBe("night");
  });
  it("walks the light across the wall and clamps at both ends", () => {
    expect(lightPosition(4)).toBe(0);
    expect(lightPosition(12.5)).toBeCloseTo(0.5, 2);
    expect(lightPosition(23)).toBe(1);
  });
});
