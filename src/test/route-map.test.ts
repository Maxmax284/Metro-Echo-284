import { describe, expect, it } from "vitest";
import { arcPath, placeStops, routeStops } from "@/lib/routeMap";
import type { Journey, Leg } from "@/lib/journey";

function leg(from: string, to: string, no: string, order = 0): Leg {
  return {
    plan_id: `p${order}`,
    order,
    flight_no: no,
    airline: null,
    from: { iata: from, at: "2026-09-19T05:15:00Z", basis: "scheduled", terminal: null, gate: null },
    to: { iata: to, at: "2026-09-20T09:10:00Z", basis: "scheduled", terminal: null, gate: null },
    live_checked_at: null,
    filed_status: null,
    override: null,
    override_note: null,
  } as Leg;
}

const journey = (legs: Leg[]): Journey => ({ id: "j", legs, segments: [], title: "t" });

describe("routeStops", () => {
  it("walks a two-leg trip without repeating the change airport", () => {
    const stops = routeStops(journey([leg("IAD", "TPE", "TG6285", 0), leg("TPE", "BKK", "TG635", 1)]));
    expect(stops.map((s) => s.iata)).toEqual(["IAD", "TPE", "BKK"]);
    expect(stops.map((s) => s.role)).toEqual(["origin", "stop", "final"]);
    expect(stops[0].city).toBe("Washington");
  });

  it("keeps a stop with no coordinate but leaves it off the drawing", () => {
    const stops = routeStops(journey([leg("IAD", "ZZZ", "XX1", 0)]));
    expect(stops[1].point).toBeNull();
    expect(placeStops(stops, { width: 320, height: 168 }).map((s) => s.iata)).toEqual(["IAD"]);
  });

  it("places stops inside the box and bows each segment", () => {
    const stops = routeStops(journey([leg("IAD", "TPE", "TG6285", 0)]));
    const placed = placeStops(stops, { width: 320, height: 168 });
    expect(placed).toHaveLength(2);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(320);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(168);
    }
    expect(arcPath(placed[0], placed[1])).toMatch(/^M .* Q .*/);
  });

  it("says nothing for a journey with fewer than two stops", () => {
    expect(routeStops(null)).toEqual([]);
  });
});
