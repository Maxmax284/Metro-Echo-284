import { describe, expect, it } from "vitest";
import { journeyFit, routeOnRecord, type FitPlan } from "../../supabase/functions/_shared/journeyFit";
import { journeysFrom } from "../../supabase/functions/_shared/journey";
import type { FlightPlan } from "../../supabase/functions/_shared/flightPlan";

/** The trip underway: IAD → TPE, landing 5:10 AM on the 20th. */
function dulles(): FlightPlan {
  return {
    id: "p1",
    origin: "IAD",
    destination: "TPE",
    depart_on: "2026-09-19",
    return_on: null,
    passengers: 1,
    currency: null,
    source: "entered",
    options: [
      {
        id: "o1",
        airline: "TG",
        flight_no: "TG6285",
        depart_at: "2026-09-19T01:15:00",
        arrive_at: "2026-09-20T05:10:00",
        price: null,
        currency: null,
        stops: null,
      },
    ],
    chosen_option_id: "o1",
    status: "confirmed",
    event_ids: [],
    confirmed_at: null,
    created_at: "2026-09-18T00:00:00Z",
    ownership: "mine",
    leg_state: "in_air",
  } as unknown as FlightPlan;
}

function fit(plan: Partial<FitPlan>) {
  const journey = journeysFrom([dulles()], new Date("2026-09-19T11:00:00Z"))[0] ?? null;
  return journeyFit({
    journey,
    plan: {
      id: "p2",
      origin: null,
      destination: null,
      depart_on: "2026-09-20",
      depart_at: null,
      flight_no: "TG637",
      ...plan,
    },
  });
}

describe("a flight added by number against a trip underway", () => {
  it("asks for the route instead of inventing one, and offers where the trip lands", () => {
    const f = fit({})!;
    expect(f.kind).toBe("needs_route");
    expect(f.suggest?.iata).toBe("TPE");
    expect(f.lead).toContain("does not know where");
    expect(f.detail.join(" ")).toContain("Nothing on the flight you are on changes");
  });

  it("never touches the flight in progress", () => {
    expect(fit({ id: "p1" })).toBeNull();
  });

  it("chains a flight leaving where the trip lands, within a day", () => {
    const f = fit({ origin: "TPE", destination: "BKK", depart_at: "2026-09-20T09:10:00" })!;
    expect(f.kind).toBe("chains");
    expect(f.lead).toContain("next leg");
    expect(f.gap_hours).toBeCloseTo(4, 0);
  });

  it("will not promise a chain with no departure time — the journey is built from times", () => {
    const f = fit({ origin: "TPE", destination: "BKK" })!;
    expect(f.kind).toBe("needs_time");
    expect(f.lead).toContain("cannot tell a connection from an overnight");
    expect(f.detail.join(" ")).toContain("No connection duration or risk is being claimed");
    expect(f.detail.join(" ")).toContain("you confirm it for your journey");
  });

  it("calls a long gap a stay rather than pretending you sit in the terminal", () => {
    const f = fit({ origin: "TPE", destination: "BKK", depart_at: "2026-09-23T09:10:00" })!;
    expect(f.kind).toBe("stay");
    expect(f.detail.join(" ")).toContain("own trip");
  });

  it("keeps a flight from another airport apart", () => {
    const f = fit({ origin: "BKK", destination: "HKG", depart_at: "2026-09-20T09:10:00" })!;
    expect(f.kind).toBe("elsewhere");
  });

  it("refuses to reconcile a flight that leaves before the trip lands", () => {
    const f = fit({ origin: "TPE", destination: "BKK", depart_at: "2026-09-19T09:10:00" })!;
    expect(f.kind).toBe("elsewhere");
    expect(f.detail.join(" ")).toContain("keeps them apart");
  });

  it("knows when both ends are on record", () => {
    expect(routeOnRecord({ id: "x", origin: "TPE", destination: "BKK", depart_on: null, depart_at: null, flight_no: null })).toBe(true);
    expect(routeOnRecord({ id: "x", origin: "", destination: "BKK", depart_on: null, depart_at: null, flight_no: null })).toBe(false);
  });
});
