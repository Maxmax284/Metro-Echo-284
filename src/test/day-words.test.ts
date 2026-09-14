import { describe, expect, it } from "vitest";
import { freshenDayWords } from "@/lib/dayWords";

const TZ = "America/New_York";
// Written 8:10 PM on the 13th, New York time.
const WRITTEN = "2026-09-14T00:10:00Z";
const text = `"ADHD appointment" is on tomorrow at 4:00 PM.`;

describe("freshenDayWords", () => {
  it("leaves the sentence alone on the day it was written", () => {
    expect(freshenDayWords({ text, createdAt: WRITTEN, timezone: TZ, now: Date.parse("2026-09-14T02:00:00Z") })).toBe(
      text,
    );
  });

  it("re-reads tomorrow as today once the day flips", () => {
    const out = freshenDayWords({ text, createdAt: WRITTEN, timezone: TZ, now: Date.parse("2026-09-14T10:00:00Z") });
    expect(out).toBe(`"ADHD appointment" is on today at 4:00 PM.`);
  });

  it("says yesterday when the day has gone by", () => {
    const out = freshenDayWords({ text, createdAt: WRITTEN, timezone: TZ, now: Date.parse("2026-09-15T14:00:00Z") });
    expect(out).toContain("yesterday");
  });

  it("names the weekday when the day is further out", () => {
    const out = freshenDayWords({
      text: "Tomorrow has an appointment in it.",
      createdAt: "2026-09-18T23:00:00Z",
      timezone: TZ,
      now: Date.parse("2026-09-16T14:00:00Z"),
    });
    expect(out).toMatch(/^On (Friday|Saturday)/);
  });

  it("keeps capitalisation and touches nothing else", () => {
    const out = freshenDayWords({
      text: "Tomorrow has an appointment in it.",
      createdAt: WRITTEN,
      timezone: TZ,
      now: Date.parse("2026-09-14T10:00:00Z"),
    });
    expect(out).toBe("Today has an appointment in it.");
  });

  it("stays quiet when it cannot work out when the note was written", () => {
    expect(freshenDayWords({ text, createdAt: null, timezone: TZ })).toBe(text);
    expect(freshenDayWords({ text, createdAt: "not a date", timezone: TZ })).toBe(text);
  });

  it("leaves a far-off day as written rather than guessing", () => {
    const out = freshenDayWords({ text, createdAt: WRITTEN, timezone: TZ, now: Date.parse("2026-10-01T14:00:00Z") });
    expect(out).toBe(text);
  });
});
