import { beforeEach, describe, expect, it } from "vitest";
import { applyRegion, currentRegion, regionAtmosphere } from "@/lib/regions";

describe("regionAtmosphere", () => {
  it("reads Bangkok as a capital metro, by city and by region", () => {
    expect(regionAtmosphere({ country: "TH", city: "Bangkok" })).toBe("capital-metro");
    expect(regionAtmosphere({ country: "Thailand", region: "Bangkok" })).toBe("capital-metro");
  });

  it("reads Samui as island coast from the province or the island name", () => {
    expect(regionAtmosphere({ country: "TH", region: "Surat Thani" })).toBe("island-coastal");
    expect(regionAtmosphere({ country: "TH", city: "Ko Samui" })).toBe("island-coastal");
    expect(regionAtmosphere({ country: "TH", city: "Phuket" })).toBe("island-coastal");
  });

  it("reads the northern mountains as mist", () => {
    expect(regionAtmosphere({ country: "TH", region: "Chiang Mai" })).toBe("northern-mist");
    expect(regionAtmosphere({ country: "JP", region: "Hokkaido" })).toBe("northern-mist");
  });

  it("reads Tokyo as brutalist metro, city speaking before region", () => {
    expect(regionAtmosphere({ country: "JP", city: "Tokyo", region: "Kanto" })).toBe("brutalist-metro");
    expect(regionAtmosphere({ country: "Japan", city: "Yokohama" })).toBe("brutalist-metro");
  });

  it("reads the DMV at city level but never claims a whole state", () => {
    expect(regionAtmosphere({ country: "US", region: "District of Columbia" })).toBe("capital-metro");
    expect(regionAtmosphere({ country: "US", city: "Chantilly", region: "Virginia" })).toBe("capital-metro");
    expect(regionAtmosphere({ country: "US", region: "Virginia" })).toBeNull();
  });

  it("graceful nothing: unmapped country, unmapped region, missing country", () => {
    expect(regionAtmosphere({ country: "DE", city: "Berlin" })).toBeNull();
    expect(regionAtmosphere({ country: "TH", region: "Khon Kaen" })).toBeNull();
    expect(regionAtmosphere({ city: "Bangkok" })).toBeNull();
    expect(regionAtmosphere({})).toBeNull();
  });

  it("never repaints on a stale fix", () => {
    expect(regionAtmosphere({ country: "TH", city: "Bangkok", stale: true })).toBeNull();
  });
});

describe("applyRegion", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-region");
  });

  it("writes the attribute for css to paint from", () => {
    applyRegion("island-coastal");
    expect(document.documentElement.getAttribute("data-region")).toBe("island-coastal");
    expect(currentRegion()).toBe("island-coastal");
  });

  it("clears on null — a stale fix never repaints the world", () => {
    applyRegion("capital-metro");
    applyRegion(null);
    expect(document.documentElement.hasAttribute("data-region")).toBe(false);
    expect(currentRegion()).toBeNull();
  });
});
