// A flight time has to read like a person says it, day included.
import { describe, expect, it } from "vitest";
import { flightTimeWords } from "@/lib/flightClock";

const NOW = new Date("2026-09-18T13:00:00Z"); // 9:00 AM New York

describe("flightTimeWords", () => {
  it("says tomorrow for the 1:15 AM departure the day after", () => {
    expect(flightTimeWords("2026-09-19T05:15:00Z", "America/New_York", NOW)).toBe("1:15 AM tomorrow");
  });

  it("calls a late evening time tonight", () => {
    expect(flightTimeWords("2026-09-19T02:15:00Z", "America/New_York", NOW)).toBe("10:15 PM tonight");
  });

  it("names the day for anything further out", () => {
    expect(flightTimeWords("2026-09-24T10:40:00Z", "America/New_York", NOW)).toBe("6:40 AM on Sep 24");
  });

  it("never invents a time it was not given", () => {
    expect(flightTimeWords(null, "America/New_York", NOW)).toBe("not on record");
    expect(flightTimeWords("not a time", "America/New_York", NOW)).toBe("not on record");
  });
});
