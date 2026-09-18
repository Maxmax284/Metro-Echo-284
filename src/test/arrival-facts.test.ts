import { describe, expect, it } from "vitest";
import { arrivalFacts, helpCells, shiftWords } from "@/lib/arrivalFacts";

describe("arrivalFacts", () => {
  it("reads Taipei in its own clock, with currency and emergency numbers", () => {
    const f = arrivalFacts("TPE", "2026-09-19T21:10:00Z", "America/New_York")!;
    expect(f.city).toBe("Taipei");
    expect(f.country).toBe("Taiwan");
    expect(f.localTime).toBe("5:10 AM");
    expect(f.localDate).toBe("2026.09.20");
    expect(f.shiftHours).toBe(12);
    expect(f.currency).toBe("TWD");
    expect(f.currencySymbol).toBe("NT$");
    expect(helpCells(f)).toBe("110 · 119");
    expect(shiftWords(f)).toBe("Taipei runs 12 hours ahead of your home clock.");
  });

  it("keeps an unknown airport unknown rather than guessing", () => {
    const f = arrivalFacts("ZZZ", "2026-09-19T21:10:00Z", "America/New_York")!;
    expect(f.city).toBeNull();
    expect(f.currency).toBeNull();
    expect(f.localTime).toBeNull();
    expect(helpCells(f)).toBeNull();
  });

  it("leaves the clock empty when no landing time is on record", () => {
    const f = arrivalFacts("BKK", null, "America/New_York")!;
    expect(f.localTime).toBeNull();
    expect(f.currency).toBe("THB");
    expect(helpCells(f)).toBe("191");
  });

  it("returns null without a code", () => {
    expect(arrivalFacts("", "2026-09-19T21:10:00Z")).toBeNull();
  });
});
