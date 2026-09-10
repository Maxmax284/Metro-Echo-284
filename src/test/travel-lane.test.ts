import { describe, expect, it } from "vitest";
import { legRunning, travelKind, travelLegs, travelWindow } from "@/lib/travelLane";

const ev = (over: Partial<Parameters<typeof travelLegs>[0][number]> = {}) => ({
  id: "e1",
  title: "Standup",
  starts_at: "2026-09-10T09:00:00Z",
  ends_at: "2026-09-10T09:30:00Z",
  all_day: false,
  location: null,
  ...over,
});

describe("travelLane", () => {
  it("names flights, stays and ground transport, and ignores ordinary work", () => {
    expect(travelKind(ev({ title: "Flight to Bangkok" }))).toBe("flight");
    expect(travelKind(ev({ title: "UA 803" }))).toBe("flight");
    expect(travelKind(ev({ title: "Wingate by Wyndham" }))).toBe("stay");
    expect(travelKind(ev({ title: "Airport shuttle" }))).toBe("transport");
    expect(travelKind(ev())).toBeNull();
  });

  it("keeps a running stay and drops finished travel", () => {
    const now = Date.parse("2026-09-12T00:00:00Z");
    const legs = travelLegs(
      [
        ev({ id: "stay", title: "Wingate stay", starts_at: "2026-09-09T00:00:00Z", ends_at: "2026-09-20T00:00:00Z", all_day: true }),
        ev({ id: "old", title: "Flight to Dulles", starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-01T12:00:00Z" }),
      ],
      now,
    );
    expect(legs.map((l) => l.id)).toEqual(["stay"]);
    expect(legRunning(legs[0], now)).toBe(true);
  });

  it("reports no end date rather than inventing one", () => {
    const legs = travelLegs(
      [ev({ id: "s", title: "Hotel stay", starts_at: "2026-09-09T00:00:00Z", ends_at: null, all_day: true })],
      Date.parse("2026-09-09T01:00:00Z"),
    );
    expect(travelWindow(legs)?.to).toBeNull();
  });
});
