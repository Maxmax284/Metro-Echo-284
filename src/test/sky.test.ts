import { describe, expect, it } from "vitest";
import { SKY_STALE_MS, skyFromCondition, skyFromWmo, skyIsFresh } from "@/lib/sky";

describe("skyFromCondition", () => {
  it("maps the snapshot's plain-word conditions onto sky kinds", () => {
    expect(skyFromCondition("clear")).toBe("clear");
    expect(skyFromCondition("partly cloudy")).toBe("cloud");
    expect(skyFromCondition("fog")).toBe("fog");
    expect(skyFromCondition("rain")).toBe("rain");
    expect(skyFromCondition("showers")).toBe("rain");
    expect(skyFromCondition("snow")).toBe("snow");
    expect(skyFromCondition("thunderstorm")).toBe("storm");
  });

  it("returns null for unknown wording — Echo does not guess at the sky", () => {
    expect(skyFromCondition("volcanic ash")).toBeNull();
    expect(skyFromCondition("")).toBeNull();
    expect(skyFromCondition(null)).toBeNull();
    expect(skyFromCondition(undefined)).toBeNull();
  });
});

describe("skyFromWmo", () => {
  it("maps WMO codes in line with the weather gauge", () => {
    expect(skyFromWmo(0)).toBe("clear");
    expect(skyFromWmo(1)).toBe("clear");
    expect(skyFromWmo(3)).toBe("cloud");
    expect(skyFromWmo(45)).toBe("fog");
    expect(skyFromWmo(61)).toBe("rain");
    expect(skyFromWmo(80)).toBe("rain");
    expect(skyFromWmo(73)).toBe("snow");
    expect(skyFromWmo(95)).toBe("storm");
    expect(skyFromWmo(99)).toBe("storm");
  });

  it("returns null for missing codes", () => {
    expect(skyFromWmo(null)).toBeNull();
    expect(skyFromWmo(undefined)).toBeNull();
    expect(skyFromWmo(NaN)).toBeNull();
  });
});

describe("skyIsFresh", () => {
  const now = Date.now();

  it("accepts a recent reading", () => {
    expect(skyIsFresh(new Date(now - 30 * 60_000).toISOString(), now)).toBe(true);
  });

  it("rejects a stale reading — old news does not repaint the room", () => {
    expect(skyIsFresh(new Date(now - SKY_STALE_MS - 1).toISOString(), now)).toBe(false);
  });

  it("rejects missing or broken timestamps", () => {
    expect(skyIsFresh(null, now)).toBe(false);
    expect(skyIsFresh("not-a-date", now)).toBe(false);
  });
});
