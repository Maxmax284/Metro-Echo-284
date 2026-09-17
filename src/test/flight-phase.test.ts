import { describe, expect, it } from "vitest";
import { flightPhase, flightProgress, type LiveFlight } from "@/lib/flightStatus";

const end = (o: Partial<LiveFlight["departure"]> = {}): LiveFlight["departure"] => ({
  airport: null, iata: null, terminal: null, gate: null,
  scheduled: null, estimated: null, actual: null, delay_min: null, ...o,
});

const live = (o: Partial<LiveFlight> = {}): LiveFlight => ({
  flight_no: "TG601", flight_date: "2026-09-17", airline: null, status: null,
  departure: end(), arrival: end(), checked_at: "2026-09-17T00:00:00Z", ...o,
});

describe("flightPhase", () => {
  it("trusts the provider's own word", () => {
    expect(flightPhase(live({ status: "cancelled" }))).toBe("stopped");
    expect(flightPhase(live({ status: "landed" }))).toBe("landed");
    expect(flightPhase(live({ status: "active" }))).toBe("flying");
  });
  it("waits when departure is still ahead", () => {
    const l = live({ departure: end({ scheduled: "2026-09-17T12:00:00Z" }) });
    expect(flightPhase(l, new Date("2026-09-17T09:00:00Z"))).toBe("waiting");
  });
  it("says nothing when nothing is on record", () => {
    expect(flightPhase(live())).toBe("unknown");
  });
});

describe("flightProgress", () => {
  it("draws nothing without both ends", () => {
    expect(flightProgress(live({ departure: end({ scheduled: "2026-09-17T12:00:00Z" }) }))).toBeNull();
  });
  it("is halfway at the middle", () => {
    const l = live({
      departure: end({ scheduled: "2026-09-17T10:00:00Z" }),
      arrival: end({ scheduled: "2026-09-17T14:00:00Z" }),
    });
    expect(flightProgress(l, new Date("2026-09-17T12:00:00Z"))).toBeCloseTo(0.5);
  });
  it("clamps and refuses a stopped flight", () => {
    const l = live({
      departure: end({ scheduled: "2026-09-17T10:00:00Z" }),
      arrival: end({ scheduled: "2026-09-17T14:00:00Z" }),
    });
    expect(flightProgress(l, new Date("2026-09-18T00:00:00Z"))).toBe(1);
    expect(flightProgress(live({ ...l, status: "diverted" }))).toBeNull();
  });
});
