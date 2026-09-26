import { describe, expect, it } from "vitest";
import { stampSpoken, stampWord } from "@/lib/welcomeStamp";
import { INTRO_COPY, introDue, introMirrorKey } from "@/lib/introSequence";
import { placePatchForFix } from "@/lib/placeMove";

describe("welcomeStamp words", () => {
  const now = new Date("2026-09-26T12:00:00");

  it("same year drops the year", () => {
    expect(stampSpoken("2026-09-20T08:00:00", now)).toBe("Sep 20");
    expect(stampWord("2026-09-20T08:00:00", now)).toBe("SEP 20");
  });

  it("another year says so", () => {
    expect(stampSpoken("2025-04-14T08:00:00", now)).toBe("Apr 14, 2025");
    expect(stampWord("2025-04-14T08:00:00", now)).toBe("APR 14 ’25");
  });

  it("a bad date is an honest nothing", () => {
    expect(stampWord("not-a-date", now)).toBeNull();
    expect(stampSpoken("", now)).toBeNull();
  });
});

describe("stamps obey the name law", () => {
  it("a real move lifts the stamp with the names", () => {
    const patch = placePatchForFix(
      { geo: { lat: 13.7, lon: 100.5, city: "Bangkok" }, country: "Thailand", region: null },
      { lat: 9.5, lon: 100.0, source: "device" },
    );
    expect(patch.stamped_at).toBeNull();
    expect(patch.country).toBeNull();
  });

  it("a short walk keeps the stamp", () => {
    const patch = placePatchForFix(
      { geo: { lat: 9.5, lon: 100.0, city: "Ko Samui" }, country: "Thailand" },
      { lat: 9.5005, lon: 100.0005, source: "device" },
    );
    expect(patch.stamped_at).toBeUndefined();
    expect(patch.country).toBeUndefined();
  });
});

describe("introSequence decision", () => {
  it("runs only when no record says it ran", () => {
    expect(introDue(undefined)).toBe(true);
    expect(introDue(null)).toBe(true);
    expect(introDue("")).toBe(true);
    expect(introDue(42)).toBe(true);
    expect(introDue("2026-09-26T00:00:00Z")).toBe(false);
  });

  it("mirrors per account, never globally", () => {
    expect(introMirrorKey("abc")).toBe("vanta.intro.seen.abc");
    expect(introMirrorKey("abc")).not.toBe(introMirrorKey("def"));
  });

  it("stays in register — no exclamation marks", () => {
    expect(INTRO_COPY.lead).not.toContain("!");
    for (const rule of INTRO_COPY.rules) expect(rule).not.toContain("!");
  });
});
