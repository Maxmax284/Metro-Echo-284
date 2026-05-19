import { describe, it, expect } from "vitest";
import { resolveLocationState } from "@/lib/awarenessLocation";
import { classifyPlaceBadness } from "@/lib/locationSanity";

const place = (overrides: any = {}) => ({
  id: "p1",
  label: overrides.label ?? "Test place",
  country: overrides.country ?? null,
  region: overrides.region ?? null,
  geo: overrides.geo ?? {},
  ...overrides,
});

describe("resolveLocationState", () => {
  it("high accuracy GPS under 50m → exact_local", () => {
    const s = resolveLocationState(place({
      country: "Thailand", region: "Surat Thani",
      geo: { lat: 9.5, lon: 100.0, acc: 18, ts: Date.now(), city: "Lamai" },
    }));
    expect(s.deviceLocationStatus).toBe("high_accuracy");
    expect(s.advisorMode).toBe("exact_local");
    expect(s.pinQuality).toBe("valid");
    expect(s.sources).toContain("phone_gps");
  });

  it("approximate 100m → exact_local with approximate device", () => {
    const s = resolveLocationState(place({
      country: "USA", region: "Virginia",
      geo: { lat: 38.8, lon: -77.3, acc: 100, ts: Date.now(), city: "Fairfax" },
    }));
    expect(s.deviceLocationStatus).toBe("approximate");
    expect(s.advisorMode).toBe("exact_local");
  });

  it("broad GPS 800m → broad_area mode", () => {
    const s = resolveLocationState(place({
      country: "USA", region: "Virginia",
      geo: { lat: 38.8, lon: -77.3, acc: 800, ts: Date.now() },
    }));
    expect(s.deviceLocationStatus).toBe("broad");
    expect(s.advisorMode).toBe("broad_area");
    expect(s.sources).toContain("broad_area");
  });

  it("weak GPS >1000m falls back to saved place", () => {
    const s = resolveLocationState(place({
      country: "Thailand", region: "Surat Thani",
      geo: { lat: 9.5, lon: 100.0, acc: 2500, ts: Date.now() },
    }));
    expect(s.deviceLocationStatus).toBe("weak");
    expect(s.advisorMode).toBe("broad_area");
    expect(s.placeUnresolved).toBe(false);
  });

  it("stale GPS timestamp", () => {
    const s = resolveLocationState(place({
      country: "USA", region: "Virginia",
      geo: { lat: 38.8, lon: -77.3, acc: 30, ts: Date.now() - 60 * 60 * 1000 },
    }));
    expect(s.deviceLocationStatus).toBe("stale");
  });

  it("offshore GPS with confirmed Ko Samui → broad_area, NOT blocked", () => {
    const p = place({
      label: "Ko Samui, Ko Samui District",
      country: "Thailand", region: "Surat Thani",
      geo: { lat: 9.5, lon: 100.0, acc: 1200, sanity: "offshore_confirmed", city: "Ko Samui" },
    });
    const s = resolveLocationState(p);
    expect(s.pinQuality).toBe("offshore");
    expect(s.placeStatus).toBe("confirmed");
    expect(s.advisorMode).toBe("broad_area");
    expect(s.isBlocked).toBe(false);
    expect(s.message).toMatch(/Ko Samui/);
  });

  it("offshore GPS with NO confirmed place → blocked", () => {
    const s = resolveLocationState(place({
      country: null, region: null,
      geo: { lat: 10, lon: 102, acc: 1500, sanity: "offshore_confirmed" },
    }));
    expect(s.advisorMode).toBe("needs_location");
    expect(s.isBlocked).toBe(true);
    expect(s.placeUnresolved).toBe(true);
  });

  it("Fairfax County broad place, no scan yet → never_scanned + scan-ready advisor", () => {
    const s = resolveLocationState(place({
      label: "Fairfax County, Virginia",
      country: "USA", region: "Virginia",
      geo: { lat: 38.83, lon: -77.28, source: "manual_search" },
    }), { generatedAt: null, serpEnabled: true });
    expect(s.scanStatus).toBe("never_scanned");
    expect(s.placeStatus).toBe("confirmed");
    expect(s.isBlocked).toBe(false);
    expect(s.sources).toContain("no_scan");
    expect(s.sources).toContain("searched_place");
    expect(s.sources).toContain("external_not_run");
  });

  it("Fairfax broad place WITH recent scan → scanned_recently", () => {
    const s = resolveLocationState(place({
      country: "USA", region: "Virginia",
      geo: { lat: 38.83, lon: -77.28, source: "manual_search" },
    }), { generatedAt: new Date().toISOString(), serpEnabled: true, serpUsed: true });
    expect(s.scanStatus).toBe("scanned_recently");
    expect(s.sources).toContain("external_on");
  });

  it("no place at all → blocked", () => {
    const s = resolveLocationState(null);
    expect(s.advisorMode).toBe("needs_location");
    expect(s.isBlocked).toBe(true);
  });
});

describe("classifyPlaceBadness — place with country is never bad", () => {
  it("Fairfax County is valid even with no exact pin", () => {
    const b = classifyPlaceBadness({
      country: "USA", region: "Virginia",
      geo: { lat: 38.83, lon: -77.28 },
    });
    expect(b.bad).toBe(false);
  });

  it("Ko Samui with offshore_confirmed pin is STILL not a bad place", () => {
    const b = classifyPlaceBadness({
      country: "Thailand", region: "Surat Thani",
      geo: { lat: 9.5, lon: 100.0, sanity: "offshore_confirmed", city: "Ko Samui" },
    });
    expect(b.bad).toBe(false);
  });

  it("unresolved (no country at all) is bad", () => {
    const b = classifyPlaceBadness({
      country: null, region: null, geo: { lat: 0, lon: 0 },
    });
    expect(b.bad).toBe(true);
  });

  it("offshore pin with no fallback country is bad", () => {
    const b = classifyPlaceBadness({
      country: null, region: null,
      geo: { lat: 10, lon: 102, sanity: "offshore_confirmed" },
    });
    expect(b.bad).toBe(true);
    expect(b.headline).toMatch(/offshore/i);
  });
});
