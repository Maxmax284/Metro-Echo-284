import { describe, expect, it } from "vitest";
import { buildCadence, cadenceRowFor, cadenceFromRow, gapPhrase, unusual, worthSurfacing } from "@/lib/baseline";

const day = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();

describe("baseline: what usually happens", () => {
  it("refuses to invent a normal from too little history", () => {
    expect(buildCadence([at(1), at(3)])).toBeNull();
    expect(buildCadence([])).toBeNull();
  });

  it("learns a median pace once there is enough history", () => {
    const c = buildCadence([at(12), at(9), at(6), at(3), at(0)]);
    expect(c).not.toBeNull();
    expect(c!.medianGapDays).toBeCloseTo(3, 1);
    expect(c!.normalLowDays).toBeLessThan(c!.medianGapDays);
    expect(c!.normalHighDays).toBeGreaterThan(c!.medianGapDays);
  });

  it("keeps missing data missing instead of turning it into zero", () => {
    expect(unusual(null, null).verdict).toBe("no_data");
    expect(unusual(null, at(4)).verdict).toBe("no_baseline_yet");
  });

  it("calls an ordinary gap usual and a long gap unusual", () => {
    const c = buildCadence([at(12), at(9), at(6), at(3), at(0)])!;
    expect(unusual(c, at(2)).verdict).toBe("usual");
    expect(unusual(c, at(30)).verdict).toBe("unusual");
  });

  it("only surfaces the genuinely unusual", () => {
    const c = buildCadence([at(12), at(9), at(6), at(3), at(0)])!;
    expect(worthSurfacing(unusual(c, at(2)))).toBe(false);
    expect(worthSurfacing(unusual(c, at(30)))).toBe(true);
    expect(worthSurfacing(unusual(null, at(2)))).toBe(false);
  });

  it("speaks plain English about gaps", () => {
    expect(gapPhrase(0.2)).toContain("hour");
    expect(gapPhrase(1)).toMatch(/day/);
    expect(gapPhrase(21)).toMatch(/week/);
  });

  it("round-trips through the stored row", () => {
    const c = buildCadence([at(12), at(9), at(6), at(3), at(0)])!;
    const row = cadenceRowFor("project", "p1", 90, c);
    const back = cadenceFromRow({ ...row, object_type: "project", object_id: "p1" } as never);
    expect(back?.medianGapDays).toBeCloseTo(c.medianGapDays, 5);
  });
});
