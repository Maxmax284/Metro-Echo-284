import { describe, it, expect } from "vitest";
import { geoForFix, movedFar, placePatchForFix, metresApart } from "@/lib/placeMove";

const samui = { lat: 9.5, lon: 100.0 };
const tokyo = { lat: 35.55, lon: 139.78 };

const samuiGeo = {
  ...samui,
  acc: 30,
  city: "Ko Samui District",
  country_code: "th",
  display_name: "Ko Samui, Surat Thani, Thailand",
  geocoded_at: "2026-09-01T00:00:00Z",
  sanity: "offshore_confirmed",
};

describe("placeMove", () => {
  it("measures the hop", () => {
    expect(Math.round(metresApart(samui, tokyo) / 1000)).toBeGreaterThan(4000);
    expect(metresApart(samui, { lat: 9.5005, lon: 100.0 })).toBeLessThan(120);
  });

  it("keeps the old detail for a short walk", () => {
    const geo = geoForFix(samuiGeo, { ...samui, lat: 9.5008, acc: 20 });
    expect(geo.city).toBe("Ko Samui District");
    expect(geo.acc).toBe(20);
    expect(movedFar(samuiGeo, { ...samui, lat: 9.5008 })).toBe(false);
  });

  it("drops every old name claim after a real move", () => {
    const geo = geoForFix(samuiGeo, { ...tokyo, acc: 18 });
    expect(geo.city).toBeUndefined();
    expect(geo.country_code).toBeUndefined();
    expect(geo.display_name).toBeUndefined();
    expect(geo.sanity).toBeUndefined();
    expect(geo.lat).toBe(tokyo.lat);
  });

  it("clears the named columns so nothing can fall back to the old country", () => {
    const patch = placePatchForFix({ geo: samuiGeo, country: "Thailand", region: "Surat Thani" }, tokyo);
    expect(patch.country).toBeNull();
    expect(patch.region).toBeNull();

    const near = placePatchForFix({ geo: samuiGeo, country: "Thailand", region: "Surat Thani" }, { ...samui, lat: 9.5008 });
    expect("country" in near).toBe(false);
  });

  it("treats a first fix with no previous coordinates as a move", () => {
    expect(movedFar({}, tokyo)).toBe(true);
  });
});
