import { describe, expect, it } from "vitest";
import { arcPath, greatCirclePoints, placeStops, routeLegVisuals, routeStops, splitAtDateline } from "@/lib/routeMap";
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
    expect(stops.map((s) => s.outboundPlanId)).toEqual(["p0", "p1", null]);
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

describe("geographic route geometry", () => {
  it("follows the northern great-circle track instead of a flat straight segment", () => {
    const points = greatCirclePoints({ lat: 38.95, lon: -77.45 }, { lat: 25.08, lon: 121.23 });
    expect(points).toHaveLength(65);
    expect(Math.max(...points.map((point) => point.lat))).toBeGreaterThan(60);
  });

  it("splits a Pacific route at the date line", () => {
    const paths = splitAtDateline(greatCirclePoints({ lat: 38.95, lon: -77.45 }, { lat: 25.08, lon: 121.23 }));
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.length > 1)).toBe(true);
  });

  it("distinguishes complete, current, and proposed onward legs", () => {
    const stops = routeStops(journey([leg("IAD", "TPE", "BR3", 0), leg("TPE", "BKK", "TG637", 1)]));
    const visuals = routeLegVisuals(stops, 0, new Set(["p0"]));
    expect(visuals.map((visual) => [visual.state, visual.record])).toEqual([
      ["current", "confirmed"],
      ["upcoming", "proposed"],
    ]);
  });
});
