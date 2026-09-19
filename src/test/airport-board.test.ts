import { describe, expect, it } from "vitest";
import { airportBoardRead } from "@/lib/airportBoard";
import type { LiveFlight } from "@/lib/flightStatus";

const live: LiveFlight = {
  flight_no: "TG6285",
  flight_date: "2026-09-19",
  airline: "Thai Airways",
  status: "scheduled",
  departure: { airport: "Dulles", iata: "IAD", terminal: "Main", gate: "B49", scheduled: "2099-09-19T01:15:00", estimated: null, actual: null, delay_min: null },
  arrival: { airport: "Taoyuan", iata: "TPE", terminal: "2", gate: null, scheduled: "2099-09-20T05:10:00", estimated: null, actual: null, delay_min: null },
  checked_at: "2026-09-19T00:00:00Z",
};

describe("airportBoardRead", () => {
  it("keeps terminal, gate and a provider-safe preflight status together", () => {
    expect(airportBoardRead(live, "gate_posted")).toEqual({
      terminal: "Main",
      gate: "B49",
      status: "GATE POSTED",
      arrivalSide: false,
      gateSince: null,
    });
  });

  it("never says boarding from the clock — only the airline says boarding", () => {
    expect(airportBoardRead(live, "boarding").status).toBe("GATE POSTED");
    expect(airportBoardRead({ ...live, status: "boarding" }).status).toBe("BOARDING");
  });

  it("names a gate it kept from an earlier reading", () => {
    const kept = {
      ...live,
      carried: [{ field: "departure.gate" as const, value: "B49", since: "2026-09-19T00:00:00Z" }],
    };
    expect(airportBoardRead(kept).gateSince).toBe("2026-09-19T00:00:00Z");
  });
});