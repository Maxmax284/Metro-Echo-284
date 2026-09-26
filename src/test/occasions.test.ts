import { describe, expect, it } from "vitest";
import { OCCASIONS, countryCodeOf, occasionFor } from "@/lib/occasions";
import { moonPhase } from "@/lib/station";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("occasionFor — fixed dates", () => {
  it("holds Songkran across all three days in Thailand", () => {
    expect(occasionFor(d(2026, 4, 13), "TH")?.id).toBe("songkran");
    expect(occasionFor(d(2026, 4, 14), "TH")?.id).toBe("songkran");
    expect(occasionFor(d(2026, 4, 15), "TH")?.id).toBe("songkran");
  });

  it("says nothing the day before or after Songkran", () => {
    expect(occasionFor(d(2026, 4, 12), "TH")).toBeNull();
    expect(occasionFor(d(2026, 4, 16), "TH")).toBeNull();
  });

  it("matches a full country name as well as the code, case-blind", () => {
    expect(occasionFor(d(2026, 4, 14), "Thailand")?.id).toBe("songkran");
    expect(occasionFor(d(2026, 4, 14), "th")?.id).toBe("songkran");
  });

  it("never invents an occasion for an unknown country or no country", () => {
    expect(occasionFor(d(2026, 4, 14), "FR")).toBeNull();
    expect(occasionFor(d(2026, 4, 14), null)).toBeNull();
    expect(occasionFor(d(2026, 4, 14), "")).toBeNull();
  });

  it("keeps the Fourth of July and Golden Week", () => {
    expect(occasionFor(d(2026, 7, 4), "US")?.id).toBe("us-independence");
    expect(occasionFor(d(2026, 5, 1), "JP")?.id).toBe("golden-week");
    expect(occasionFor(d(2026, 4, 29), "JP")?.id).toBe("golden-week");
    expect(occasionFor(d(2026, 5, 6), "JP")).toBeNull();
  });
});

describe("occasionFor — weekday rules", () => {
  it("finds Thanksgiving on the fourth Thursday of November", () => {
    expect(occasionFor(d(2026, 11, 26), "US")?.id).toBe("thanksgiving");
    expect(occasionFor(d(2027, 11, 25), "US")?.id).toBe("thanksgiving");
    expect(occasionFor(d(2026, 11, 25), "US")).toBeNull();
  });

  it("finds Memorial Day on the last Monday of May, with a remembrance tone", () => {
    const o = occasionFor(d(2026, 5, 25), "US");
    expect(o?.id).toBe("memorial-day");
    expect(o?.tone).toBe("remembrance");
    expect(occasionFor(d(2026, 5, 26), "US")).toBeNull();
  });
});

describe("occasionFor — astronomy", () => {
  it("puts Trinidad Carnival on the Monday and Tuesday before Ash Wednesday", () => {
    // Easter 2026 is April 5 → Ash Wednesday Feb 18 → Carnival Feb 16–17.
    expect(occasionFor(d(2026, 2, 16), "TT")?.id).toBe("carnival");
    expect(occasionFor(d(2026, 2, 17), "TT")?.id).toBe("carnival");
    expect(occasionFor(d(2026, 2, 15), "TT")).toBeNull();
    expect(occasionFor(d(2026, 2, 18), "TT")).toBeNull();
    // Easter 2025 was April 20 → Carnival was March 3–4 (the real dates).
    expect(occasionFor(d(2025, 3, 3), "TT")?.id).toBe("carnival");
    expect(occasionFor(d(2025, 3, 4), "TT")?.id).toBe("carnival");
    expect(occasionFor(d(2025, 3, 5), "TT")).toBeNull();
  });

  it("centres Loy Krathong on a genuinely full November moon, day either side", () => {
    const loy = OCCASIONS.find((o) => o.id === "loy-krathong")!;
    for (const year of [2025, 2026, 2027]) {
      const w = loy.window(year);
      expect(w.start[0]).toBeGreaterThanOrEqual(10); // never wanders out of autumn
      expect(w.end[0]).toBeLessThanOrEqual(12);
      const mid = new Date(Date.UTC(year, w.start[0] - 1, w.start[1] + 1));
      // The middle of the window must be within a day and a half of true full.
      expect(Math.abs(moonPhase(mid).ageDays - 29.53059 / 2)).toBeLessThan(1.5);
      // And the window answers through the public door.
      const probe = new Date(year, w.start[0] - 1, w.start[1] + 1);
      expect(occasionFor(probe, "TH")?.id).toBe("loy-krathong");
    }
    // A plain November day far from the full moon stays ordinary.
    expect(occasionFor(d(2026, 11, 2), "TH")).toBeNull();
  });
});

describe("countryCodeOf", () => {
  it("passes ISO codes through and maps the kept names", () => {
    expect(countryCodeOf("th")).toBe("TH");
    expect(countryCodeOf("United States")).toBe("US");
    expect(countryCodeOf("Trinidad and Tobago")).toBe("TT");
    expect(countryCodeOf("France")).toBeNull();
    expect(countryCodeOf(undefined)).toBeNull();
  });
});
