import { describe, expect, it } from "vitest";
import { editionFor } from "@/lib/stationEdition";

const ON = { optedIn: true, stale: false };

describe("editionFor", () => {
  it("off means off — no decal even on a kept day in a kept country", () => {
    expect(editionFor(new Date(2026, 3, 14), "TH", { optedIn: false, stale: false })).toBeNull();
  });

  it("a stale fix wears nothing", () => {
    expect(editionFor(new Date(2026, 3, 14), "TH", { optedIn: true, stale: true })).toBeNull();
  });

  it("Songkran holds mid-window with its water motif and a real leaving day", () => {
    const e = editionFor(new Date(2026, 3, 14), "TH", ON);
    expect(e).not.toBeNull();
    expect(e!.id).toBe("songkran");
    expect(e!.tone).toBe("celebration");
    expect(e!.motif).toBe("water");
    expect(e!.until).toBe("Apr 15");
  });

  it("expires on its own — the day after the window is honest nothing", () => {
    expect(editionFor(new Date(2026, 3, 16), "TH", ON)).toBeNull();
  });

  it("Memorial Day keeps the remembrance tone quiet (last Monday of May 2026 = May 25)", () => {
    const e = editionFor(new Date(2026, 4, 25), "US", ON);
    expect(e).not.toBeNull();
    expect(e!.id).toBe("memorial-day");
    expect(e!.tone).toBe("remembrance");
    expect(e!.motif).toBe("remember");
    expect(e!.until).toBe("May 25");
  });

  it("Golden Week spans its whole run — Apr 30 holds, May 6 is nothing", () => {
    const e = editionFor(new Date(2026, 3, 30), "JP", ON);
    expect(e!.id).toBe("golden-week");
    expect(e!.motif).toBe("journey");
    expect(e!.until).toBe("May 5");
    expect(editionFor(new Date(2026, 4, 6), "JP", ON)).toBeNull();
  });

  it("speaks full country names as well as codes", () => {
    expect(editionFor(new Date(2026, 3, 14), "Thailand", ON)!.id).toBe("songkran");
  });

  it("an unmapped country gets no decal guessed for it", () => {
    expect(editionFor(new Date(2026, 3, 14), "FR", ON)).toBeNull();
    expect(editionFor(new Date(2026, 3, 14), null, ON)).toBeNull();
  });

  it("the decal never disagrees with the boot stamp about the window", () => {
    // First and last days of Songkran hold; the neighbours do not.
    expect(editionFor(new Date(2026, 3, 13), "TH", ON)!.until).toBe("Apr 15");
    expect(editionFor(new Date(2026, 3, 15), "TH", ON)).not.toBeNull();
    expect(editionFor(new Date(2026, 3, 12), "TH", ON)).toBeNull();
  });
});
