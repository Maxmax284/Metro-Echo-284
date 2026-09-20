import { describe, expect, it } from "vitest";
import { journeysFrom, legState, whereOnJourney } from "@/lib/journey";
import type { FlightPlan } from "@/lib/flightPlan";

const NOW = new Date("2026-09-20T00:02:00.000Z"); // 08:02 in Taipei

function plan(over: Partial<FlightPlan> & { id: string }): FlightPlan {
  return {
    id: over.id,
    user_id: "u",
    organization_id: null,
    origin: "IAD",
    destination: "TPE",
    depart_on: "2026-09-19",
    return_on: null,
    passengers: 1,
    currency: "USD",
    source: "desk",
    options: [],
    chosen_option_id: null,
    status: "confirmed",
    event_ids: [],
    confirmed_at: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    origin_kind: "desk",
    ownership: "mine",
    traveller_name: null,
    booking_ref: null,
    noticed_from: null,
    live_status: null,
    live_checked_at: null,
    journey_id: null,
    leg_order: 0,
    leg_state: null,
    leg_state_source: null,
    leg_state_at: null,
    leg_state_note: null,
    ...over,
  } as FlightPlan;
}

/** The leg he actually flew: landed, with his own stale "boarding" tap on it. */
const flown = plan({
  id: "br3",
  origin: "IAD",
  destination: "TPE",
  leg_state: "boarding",
  leg_state_source: "you",
  options: [{ id: "o1", flight_no: "BR3", depart_at: "2026-09-19T01:15:00", arrive_at: "2026-09-20T05:10:00" } as never],
  live_status: {
    flight_no: "BR3",
    flight_date: "2026-09-19",
    airline: "EVA Air",
    status: "landed",
    departure: { airport: null, iata: "IAD", terminal: null, gate: null, scheduled: "2026-09-19T01:15:00", estimated: null, actual: "2026-09-19T01:18:00", delay_min: null },
    arrival: { airport: null, iata: "TPE", terminal: null, gate: null, scheduled: "2026-09-20T05:10:00", estimated: null, actual: "2026-09-20T05:21:00", delay_min: null },
    checked_at: "2026-09-19T23:50:00.000Z",
  } as never,
  live_checked_at: "2026-09-19T23:50:00.000Z",
});

/** The onward leg, boarding time off a paper ticket, nothing filed. */
const onward = plan({
  id: "tg637",
  origin: "TPE",
  destination: "BKK",
  depart_on: "2026-09-20",
  options: [{ id: "o2", flight_no: "TG637", depart_at: "2026-09-20T07:15:00", arrive_at: null } as never],
});

describe("your word on the leg you are actually on", () => {
  it("says so when the airline has since contradicted your word, without erasing it", () => {
    const journey = journeysFrom([flown, onward])[0];
    const first = legState(journey.legs[0], NOW);
    expect(first.source).toBe("you");
    expect(first.kind).toBe("boarding");
    expect(first.stale).toBe(true);
    expect(first.words).toContain("older than the feed");
  });

  it("stops a contradicted word holding you in the airport you left", () => {
    const journey = journeysFrom([flown, onward])[0];
    const where = whereOnJourney(journey, NOW);
    expect(where.kind).not.toBe("boarding");
    expect(where.legIndex).toBe(0);
    expect(where.nextLeg?.flight_no).toBe("TG637");
  });

  it("puts you on the onward leg once you say you are on it", () => {
    const said = { ...onward, leg_state: "in_air", leg_state_source: "you" } as FlightPlan;
    const journey = journeysFrom([flown, said])[0];
    const where = whereOnJourney(journey, NOW);
    expect(where.kind).toBe("in_air");
    expect(where.legIndex).toBe(1);
    expect(journey.legs[where.legIndex].to.iata).toBe("BKK");
  });

  it("takes the furthest-along word, not the first one on the list", () => {
    const a = { ...flown, leg_state: "in_air", leg_state_source: "you" } as FlightPlan;
    const b = { ...onward, leg_state: "in_air", leg_state_source: "you" } as FlightPlan;
    const journey = journeysFrom([a, b])[0];
    expect(whereOnJourney(journey, NOW).legIndex).toBe(1);
  });
});
