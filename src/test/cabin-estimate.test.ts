import { describe, expect, it } from "vitest";
import { cabinDriftWords, cabinLandingAt } from "@/lib/cabinEstimate";
import { anchorToZone, airportZone } from "@/lib/travelSense";
import { bigNumbers, type Journey, type Leg } from "@/lib/journey";

const FILED = anchorToZone("2026-09-20T05:10:00", airportZone("TPE"))!;

describe("cabin screen landing time", () => {
  it("pins a bare clock reading to the day nearest the filed landing", () => {
    const at = cabinLandingAt("05:40", FILED, anchorToZone, airportZone("TPE"));
    expect(at).toBeTruthy();
    expect(Date.parse(at!) - Date.parse(FILED)).toBe(30 * 60_000);
  });

  it("refuses nonsense rather than guessing", () => {
    expect(cabinLandingAt("nope", FILED, anchorToZone, airportZone("TPE"))).toBeNull();
    expect(cabinLandingAt("25:00", FILED, anchorToZone, airportZone("TPE"))).toBeNull();
    expect(cabinLandingAt("05:40", null, anchorToZone, airportZone("TPE"))).toBeNull();
  });

  it("says how far off the filed landing it is", () => {
    const at = cabinLandingAt("05:40", FILED, anchorToZone, airportZone("TPE"))!;
    expect(cabinDriftWords(at, FILED)).toBe("30m later than the filed landing");
    expect(cabinDriftWords(FILED, FILED)).toBe("the same as the filed landing");
  });
});

describe("the countdown in the air", () => {
  const leg: Leg = {
    plan_id: "p1",
    order: 0,
    flight_no: "BR3",
    airline: "EVA Air",
    from: {
      iata: "IAD",
      at: anchorToZone("2026-09-19T01:15:00", airportZone("IAD")),
      basis: "scheduled",
      terminal: null,
      gate: null,
    },
    to: { iata: "TPE", at: FILED, basis: "scheduled", terminal: null, gate: null },
    live_checked_at: null,
    filed_status: "scheduled",
    override: "in_air",
    override_note: null,
  };
  const journey: Journey = { id: "j1", legs: [leg], segments: [], title: "Dulles to Taipei" };
  const now = new Date(Date.parse(FILED) - 11 * 3600_000);

  it("runs on the filed landing when the traveller has read nothing", () => {
    const n = bigNumbers(journey, now);
    expect(n.timeLeftLabel).toBe("until you land, on the filed times");
    expect(n.timeLeft).toBe("11h");
  });

  it("follows the cabin screen once the traveller reads it", () => {
    const cabin = cabinLandingAt("05:40", FILED, anchorToZone, airportZone("TPE"))!;
    const n = bigNumbers(journey, now, cabin);
    expect(n.timeLeftLabel).toBe("until you land, on the cabin screen");
    expect(n.timeLeft).toBe("11h 30m");
  });
});
