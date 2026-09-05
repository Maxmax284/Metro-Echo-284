import { describe, it, expect } from "vitest";
import {
  formatDistance,
  formatDuration,
  metersBetween,
  pathDistanceMeters,
  placeYouAreAt,
  runningLine,
  staleTripDiff,
  thisWeekLine,
  tripSummaryLine,
  weeklyMileage,
  type Trip,
} from "@/lib/trips";
import { placeNoteFor, readSituation } from "@/lib/situation";

const NOW = new Date("2026-09-05T06:00:00Z").getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  label: null,
  purpose: null,
  started_at: iso(2 * 60 * 60 * 1000),
  ended_at: iso(60 * 60 * 1000),
  start_label: "Lamai",
  end_label: "Nathon",
  distance_m: 12_400,
  point_count: 9,
  closed_by: "you",
  ...over,
});

describe("trip measurement", () => {
  it("measures real distance and ignores a phone sitting still", () => {
    const a = { lat: 9.4667, lon: 100.0417 };
    const b = { lat: 9.5, lon: 100.0417 };
    expect(Math.round(metersBetween(a, b) / 100) * 100).toBe(3700);
    const jitter = [
      { ...a, recorded_at: iso(600_000) },
      { lat: a.lat + 0.00005, lon: a.lon, recorded_at: iso(540_000) },
      { lat: a.lat + 0.0001, lon: a.lon, recorded_at: iso(480_000) },
    ];
    expect(pathDistanceMeters(jitter)).toBe(0);
    expect(Math.round(pathDistanceMeters([{ ...a, recorded_at: iso(600_000) }, { ...b, recorded_at: iso(60_000) }]))).toBeGreaterThan(3000);
  });

  it("never turns an unmeasured trip into a zero", () => {
    expect(formatDistance(null)).toBe("not measured");
    expect(formatDistance(780)).toBe("780 m");
    expect(formatDistance(12_400)).toBe("12 km");
    expect(formatDistance(4200)).toBe("4.2 km");
    expect(formatDuration(null)).toBe("unknown");
    expect(formatDuration(20_000)).toBe("under a minute");
    expect(formatDuration(72 * 60_000)).toBe("1h 12m");
  });

  it("keeps running state visible", () => {
    const open = trip({ ended_at: null, closed_by: "open", distance_m: null });
    expect(runningLine(open, 3200, NOW)).toBe("Trip running for 2h 0m · 3.2 km");
    expect(runningLine(open, null, NOW)).toContain("distance not measured yet");
  });

  it("reads a finished trip as one plain line", () => {
    expect(tripSummaryLine(trip(), NOW)).toBe("Lamai → Nathon · 12 km · 1h 0m");
    expect(tripSummaryLine(trip({ end_label: null, distance_m: null }), NOW)).toContain("not measured");
  });
});

describe("forgotten trips and mileage", () => {
  it("auto-closes with a diff and admits what it cannot know", () => {
    const stale = trip({ started_at: iso(20 * 60 * 60 * 1000), ended_at: null, closed_by: "open" });
    const diff = staleTripDiff(stale, iso(14 * 60 * 60 * 1000), NOW);
    expect(diff).toContain("closed it at the last point");
    expect(diff).toContain("is unknown");
    expect(staleTripDiff(trip(), null, NOW)).toBeNull();
    expect(staleTripDiff(trip({ ended_at: null, closed_by: "open" }), null, NOW)).toBeNull();
  });

  it("adds up the week without inventing kilometres", () => {
    const week = weeklyMileage([trip(), trip({ id: "t2", distance_m: 2600 })]);
    expect(week).toHaveLength(1);
    expect(week[0].meters).toBe(15_000);
    expect(thisWeekLine([trip(), trip({ id: "t2", distance_m: 2600 })], NOW)).toBe("15 km across 2 trips this week.");
    expect(thisWeekLine([trip({ distance_m: null })], NOW)).toBe("1 trip this week. No distance recorded on them.");
    expect(thisWeekLine([], NOW)).toBeNull();
  });
});

describe("place-aware relevance", () => {
  const lamai = { label: "Lamai", lat: 9.4667, lon: 100.0417 };

  it("names a saved place only when you are genuinely inside it", () => {
    expect(placeYouAreAt({ lat: 9.4668, lon: 100.0418 }, [lamai])).toBe("Lamai");
    expect(placeYouAreAt({ lat: 9.55, lon: 100.0417 }, [lamai])).toBeNull();
    expect(placeYouAreAt(null, [lamai])).toBeNull();
    expect(placeYouAreAt({ lat: 9.4668, lon: 100.0418 }, [{ label: "No pin", lat: null, lon: null }])).toBeNull();
  });

  it('says "You\'re at Lamai" instead of a city when the pin is tight', () => {
    expect(placeNoteFor({ where: "Surat Thani", scope: "exact", at: iso(0), savedPlace: "Lamai" })).toBe("You're at Lamai.");
    expect(placeNoteFor({ where: "Surat Thani", scope: "city", at: iso(0), savedPlace: "Lamai" })).toBe("Read from Surat Thani.");
    expect(placeNoteFor({ where: "Surat Thani", scope: "exact", at: iso(0) })).toContain("Read from where you are");
  });

  it("still adds no line of its own", () => {
    const read = readSituation({
      now: NOW,
      overdue: [],
      dueSoon: [],
      waitingOnYou: [],
      arrived: [{ id: "a1", label: "A photo", at: iso(60_000), via: "telegram" }],
      noticed: [],
      meetings: [],
      projects: [],
      place: { where: "Surat Thani", scope: "exact", at: iso(60_000), savedPlace: "Lamai" },
    });
    expect(read.placeNote).toBe("You're at Lamai.");
    expect(read.lines).toHaveLength(1);
  });
});
