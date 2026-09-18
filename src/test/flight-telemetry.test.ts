// The aircraft's own telemetry: only the airline's numbers, with their age.
import { describe, expect, it } from "vitest";
import {
  altitudeWords,
  climbWords,
  fixAgeMin,
  headingWords,
  positionProgress,
  speedWords,
  trackProgress,
  type LiveFlight,
  type LivePosition,
} from "@/lib/flightStatus";

const NOW = new Date("2026-09-19T08:00:00Z");

function flight(pos: LivePosition | null): LiveFlight {
  return {
    flight_no: "TG6285",
    flight_date: "2026-09-19",
    airline: "Thai Airways",
    status: "active",
    departure: {
      airport: "Dulles",
      iata: "IAD",
      terminal: null,
      gate: null,
      scheduled: "2026-09-19T05:15:00Z",
      estimated: null,
      actual: "2026-09-19T05:20:00Z",
      delay_min: null,
    },
    arrival: {
      airport: "Taoyuan",
      iata: "TPE",
      terminal: null,
      gate: null,
      scheduled: "2026-09-19T21:10:00Z",
      estimated: null,
      actual: null,
      delay_min: null,
    },
    position: pos,
    checked_at: NOW.toISOString(),
  };
}

const fix = (over: Partial<LivePosition> = {}): LivePosition => ({
  updated: "2026-09-19T07:55:00Z",
  lat: 50,
  lon: -90,
  altitude_m: 10668,
  heading_deg: 300,
  speed_kmh: 900,
  vertical_kmh: 0,
  on_ground: false,
  ...over,
});

describe("telemetry words", () => {
  it("prints altitude in feet and speed in mph", () => {
    expect(altitudeWords(fix())).toBe("35,000 ft");
    expect(speedWords(fix())).toBe("559 mph");
  });

  it("prints a heading with its compass point", () => {
    expect(headingWords(fix({ heading_deg: 300 }))).toBe("300° WNW");
    expect(headingWords(fix({ heading_deg: 0 }))).toBe("0° N");
  });

  it("says nothing when the airline filed nothing", () => {
    expect(altitudeWords(fix({ altitude_m: null }))).toBeNull();
    expect(speedWords(null)).toBeNull();
    expect(headingWords(fix({ heading_deg: null }))).toBeNull();
    expect(climbWords(fix({ vertical_kmh: null }))).toBeNull();
  });

  it("reads climb and descent from the vertical rate", () => {
    expect(climbWords(fix({ vertical_kmh: 12 }))).toBe("climbing");
    expect(climbWords(fix({ vertical_kmh: -12 }))).toBe("descending");
    expect(climbWords(fix({ vertical_kmh: 0 }))).toBe("level");
  });

  it("ages a fix in minutes", () => {
    expect(fixAgeMin(fix(), NOW)).toBe(5);
    expect(fixAgeMin(fix({ updated: null }), NOW)).toBeNull();
  });
});

describe("position on the track", () => {
  it("measures progress from the aircraft's own fix", () => {
    const p = positionProgress(flight(fix()), NOW);
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThan(0);
    expect(p!).toBeLessThan(0.5);
    expect(trackProgress(flight(fix()), NOW).source).toBe("radar");
  });

  it("falls back to the clock when the fix is stale", () => {
    const stale = fix({ updated: "2026-09-19T06:00:00Z" });
    expect(positionProgress(flight(stale), NOW)).toBeNull();
    expect(trackProgress(flight(stale), NOW).source).toBe("clock");
  });

  it("refuses a fix when an airport has no coordinate on record", () => {
    const f = flight(fix());
    f.arrival.iata = "ZZZ";
    expect(positionProgress(f, NOW)).toBeNull();
  });

  it("keeps progress inside the track even for a fix off to the side", () => {
    const p = positionProgress(flight(fix({ lat: 10, lon: -40 })), NOW);
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThanOrEqual(0);
    expect(p!).toBeLessThanOrEqual(1);
  });
});
