import { beforeEach, describe, expect, it } from "vitest";
import { applyRegionTint, applySeason, currentRegionTint, currentSeason, regionTint } from "@/lib/regionTint";

describe("regionTint", () => {
  it("tints from the latitude band — any country, no painted asset needed", () => {
    expect(regionTint({ lat: 9.5, daypart: "day" })?.band).toBe("tropical"); // Koh Samui
    expect(regionTint({ lat: 13.75, daypart: "day" })?.band).toBe("tropical"); // Bangkok
    expect(regionTint({ lat: 38.9, daypart: "day" })?.band).toBe("temperate"); // Washington
    expect(regionTint({ lat: 35.7, daypart: "day" })?.band).toBe("temperate"); // Tokyo
    expect(regionTint({ lat: 10.7, daypart: "day" })?.band).toBe("tropical"); // Port of Spain
    expect(regionTint({ lat: 64.1, daypart: "day" })?.band).toBe("subpolar"); // Reykjavik
    expect(regionTint({ lat: -33.9, daypart: "day" })?.band).toBe("subtropical"); // Sydney
    expect(regionTint({ lat: 1.35, daypart: "day" })?.band).toBe("equatorial"); // Singapore
    expect(regionTint({ lat: 78.2, daypart: "day" })?.band).toBe("polar"); // Svalbard
  });

  it("keeps the day bend it is given", () => {
    expect(regionTint({ lat: 9.5, daypart: "golden" })?.daypart).toBe("golden");
    expect(regionTint({ lat: 9.5, daypart: "night" })?.daypart).toBe("night");
  });

  it("a missing daypart is neutral, not fatal — the band still paints", () => {
    const tint = regionTint({ lat: 9.5 });
    expect(tint?.band).toBe("tropical");
    expect(tint?.daypart).toBe("day");
  });

  it("no honest latitude, no tint — Echo never guesses at geography", () => {
    expect(regionTint({ lat: null })).toBeNull();
    expect(regionTint({ lat: undefined })).toBeNull();
    expect(regionTint({ lat: "not a number" })).toBeNull();
    expect(regionTint({ lat: 91 })).toBeNull();
    expect(regionTint({ lat: -91 })).toBeNull();
  });
});

describe("applyRegionTint", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-lat-band");
    document.documentElement.removeAttribute("data-daypart");
  });

  it("writes both attributes for css to paint from", () => {
    applyRegionTint({ band: "tropical", daypart: "dusk" });
    expect(document.documentElement.getAttribute("data-lat-band")).toBe("tropical");
    expect(document.documentElement.getAttribute("data-daypart")).toBe("dusk");
    expect(currentRegionTint()).toEqual({ band: "tropical", daypart: "dusk" });
  });

  it("clears both attributes on null — a stale fix never repaints the world", () => {
    applyRegionTint({ band: "polar", daypart: "night" });
    applyRegionTint(null);
    expect(document.documentElement.hasAttribute("data-lat-band")).toBe(false);
    expect(document.documentElement.hasAttribute("data-daypart")).toBe(false);
    expect(currentRegionTint()).toBeNull();
  });
});

describe("applySeason", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-season");
  });

  it("writes the season key for css to lean on", () => {
    applySeason("wet");
    expect(document.documentElement.getAttribute("data-season")).toBe("wet");
    expect(currentSeason()).toBe("wet");
  });

  it("clears on null — a place with no honest latitude wears no season", () => {
    applySeason("winter");
    applySeason(null);
    expect(document.documentElement.hasAttribute("data-season")).toBe(false);
    expect(currentSeason()).toBeNull();
  });
});
