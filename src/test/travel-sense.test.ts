// Arithmetic, with every assumption said out loud.
import { describe, expect, it } from "vitest";
import { CUSHION_MIN, clockShift, clockShiftNote, leaveForFlight, offsetMinutes } from "@/lib/travelSense";

describe("when to leave", () => {
  it("refuses to invent a leave time with no filed departure", () => {
    const r = leaveForFlight({ departAt: null, fromIata: "IAD", toIata: "BKK" });
    expect(r.leaveAt).toBeNull();
    expect(r.airportBy).toBeNull();
    expect(r.words).toMatch(/no filed departure time/i);
  });

  it("uses a bigger cushion when the flight crosses a border", () => {
    const dom = leaveForFlight({ departAt: "2026-10-01T18:00:00Z", fromIata: "IAD", toIata: "LAX" });
    const intl = leaveForFlight({ departAt: "2026-10-01T18:00:00Z", fromIata: "IAD", toIata: "BKK" });
    expect(dom.cushionMin).toBe(CUSHION_MIN.domestic);
    expect(intl.cushionMin).toBe(CUSHION_MIN.international);
    expect(dom.airportBy).toBe("2026-10-01T16:00:00.000Z");
    expect(intl.airportBy).toBe("2026-10-01T15:00:00.000Z");
  });

  it("asks for the ride instead of guessing it", () => {
    const r = leaveForFlight({ departAt: "2026-10-01T18:00:00Z", fromIata: "IAD", toIata: "LAX" });
    expect(r.leaveAt).toBeNull();
    expect(r.words).toMatch(/how long your ride takes/i);
  });

  it("gives a leave-by time once the ride is known, and names both assumptions", () => {
    const r = leaveForFlight({ departAt: "2026-10-01T18:00:00Z", fromIata: "IAD", toIata: "LAX", rideMinutes: 40 });
    expect(r.leaveAt).toBe("2026-10-01T15:20:00.000Z");
    expect(r.assumptions).toHaveLength(2);
    expect(r.words).toMatch(/Leave by 15:20 UTC/);
  });

  it("admits when it cannot tell whether a border is crossed", () => {
    const r = leaveForFlight({ departAt: "2026-10-01T18:00:00Z", fromIata: null, toIata: null });
    expect(r.cushionMin).toBe(CUSHION_MIN.unknown);
    expect(r.assumptions[0]).toMatch(/could not tell/i);
  });
});

describe("what the clock does", () => {
  it("reads a zone offset", () => {
    expect(offsetMinutes("UTC", new Date("2026-10-01T12:00:00Z"))).toBe(0);
    expect(offsetMinutes("Asia/Bangkok", new Date("2026-10-01T12:00:00Z"))).toBe(420);
    expect(offsetMinutes("Not/AZone")).toBeNull();
  });

  it("says how far the clock jumps and which way", () => {
    const s = clockShift("IAD", "BKK", new Date("2026-10-01T12:00:00Z"));
    expect(s?.direction).toBe("ahead");
    expect(s?.hours).toBe(11);
    expect(s?.words).toMatch(/ahead of Washington/);
  });

  it("stays quiet about an airport it does not keep", () => {
    expect(clockShift("IAD", "ZZZ")).toBeNull();
    expect(clockShift(null, "BKK")).toBeNull();
  });

  it("only offers a body-clock note when the jump is big enough", () => {
    expect(clockShiftNote(clockShift("IAD", "BKK", new Date("2026-10-01T12:00:00Z")))).toMatch(/harder direction/);
    expect(clockShiftNote(clockShift("IAD", "JFK", new Date("2026-10-01T12:00:00Z")))).toBeNull();
    expect(clockShiftNote(null)).toBeNull();
  });
});
