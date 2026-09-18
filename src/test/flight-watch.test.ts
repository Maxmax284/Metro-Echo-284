import { describe, expect, it } from "vitest";
import { insideWatchWindow, nextToRead, readingDue } from "@/lib/flightWatch";
import type { FlightPlan } from "@/lib/flightPlan";

const base = (over: Partial<FlightPlan> = {}): FlightPlan =>
  ({
    id: "p1",
    origin: "IAD",
    destination: "TPE",
    depart_on: "2026-09-19",
    return_on: null,
    passengers: 1,
    currency: null,
    source: "entered",
    options: [{ id: "o1", flight_no: "TG6285", depart_at: "2026-09-19T05:15:00Z" } as never],
    chosen_option_id: null,
    status: "confirmed",
    event_ids: [],
    created_at: "2026-09-18T00:00:00Z",
    confirmed_at: null,
    origin_kind: "desk",
    ownership: "mine",
    traveller_name: null,
    booking_ref: null,
    noticed_from: null,
    live_status: null,
    live_checked_at: null,
    ...over,
  }) as FlightPlan;

const dep = Date.parse("2026-09-19T05:15:00Z");

describe("flightWatch", () => {
  it("watches a flight a day out", () => {
    expect(insideWatchWindow(base(), dep - 20 * 3600_000)).toBe(true);
  });

  it("leaves a flight weeks away alone", () => {
    expect(insideWatchWindow(base(), dep - 20 * 24 * 3600_000)).toBe(false);
  });

  it("stops well after the flight is over", () => {
    expect(insideWatchWindow(base(), dep + 40 * 3600_000)).toBe(false);
  });

  it("never reads a flight whose owner is still unknown", () => {
    expect(insideWatchWindow(base({ ownership: "unknown" }), dep - 3600_000)).toBe(false);
  });

  it("reuses a reading taken a minute ago", () => {
    const now = dep - 3600_000;
    const plan = base({ live_checked_at: new Date(now - 60_000).toISOString() });
    expect(readingDue(plan, now)).toBe(false);
    expect(nextToRead([plan], now)).toBeNull();
  });

  it("takes the oldest reading first, one at a time", () => {
    const now = dep - 3600_000;
    const older = base({ id: "old", live_checked_at: new Date(now - 60 * 60_000).toISOString() });
    const newer = base({ id: "new", live_checked_at: new Date(now - 10 * 60_000).toISOString() });
    expect(nextToRead([newer, older], now)?.id).toBe("old");
  });
});
