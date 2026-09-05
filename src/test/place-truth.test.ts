import { describe, it, expect } from "vitest";
import { placeTruth, precisionFor, placeSourceBadge, accuracyMetres } from "@/lib/placeTruth";

const NOW = new Date("2026-09-05T07:00:00Z").getTime();

describe("placeTruth", () => {
  it("never claims more precision than the fix supports", () => {
    expect(precisionFor(20)).toBe("street");
    expect(precisionFor(300)).toBe("neighbourhood");
    expect(precisionFor(3000)).toBe("city");
    expect(precisionFor(40000)).toBe("area");
    expect(precisionFor(null)).toBe("unknown");
  });

  it("teaches how to set a place when there is none", () => {
    const t = placeTruth(null, NOW);
    expect(t.line).toMatch(/no place to work from/);
    expect(t.name).toBeNull();
  });

  it("refuses to name somewhere it could not resolve", () => {
    const t = placeTruth(
      { label: "Spot 8/29", geo: { lat: 9.4, lon: 100.0, acc: 13 }, updated_at: new Date(NOW - 60_000).toISOString() },
      NOW,
    );
    expect(t.name).toBeNull();
    expect(t.line).toMatch(/can't tell what's there/);
  });

  it("speaks a fresh street-level fix plainly", () => {
    const t = placeTruth(
      { geo: { lat: 9.5, lon: 100.0, acc: 20, city: "Lamai", source: "device" }, updated_at: new Date(NOW - 120_000).toISOString() },
      NOW,
    );
    expect(t.line).toContain("You're in Lamai");
    expect(t.precision).toBe("street");
    expect(placeSourceBadge(t)).toBe("From your device");
  });

  it("softens a wide fix and says how wide", () => {
    const t = placeTruth(
      { geo: { lat: 9.5, lon: 100.0, acc: 40000, city: "Surat Thani" }, updated_at: new Date(NOW - 60_000).toISOString() },
      NOW,
    );
    expect(t.line).toMatch(/Somewhere around Surat Thani/);
    expect(t.line).toMatch(/40km/);
  });

  it("calls a hand-placed pin the person's own, and an old fix last known", () => {
    const manual = placeTruth(
      { geo: { city: "Lamai", acc: 30, source: "manual" }, updated_at: new Date(NOW - 60_000).toISOString() },
      NOW,
    );
    expect(manual.setByYou).toBe(true);
    expect(placeSourceBadge(manual)).toBe("Location set by you");

    const old = placeTruth(
      { geo: { city: "Lamai", acc: 30, source: "device" }, updated_at: new Date(NOW - 3 * 86400_000).toISOString() },
      NOW,
    );
    expect(old.stale).toBe(true);
    expect(old.line).toMatch(/last place Vanta knew/);
    expect(placeSourceBadge(old)).toBe("Last known place");

    const nothingRecorded = placeTruth(
      { geo: { city: "Lamai", acc: 30 }, updated_at: new Date(NOW - 60_000).toISOString() },
      NOW,
    );
    expect(placeSourceBadge(nothingRecorded)).toBe("How this was set wasn't recorded");
  });

  it("reads accuracy from either shape", () => {
    expect(accuracyMetres({ geo: { acc: 12 } })).toBe(12);
    expect(accuracyMetres({ geo: { accuracy_m: 90 } })).toBe(90);
    expect(accuracyMetres({ geo: {} })).toBeNull();
  });
});
