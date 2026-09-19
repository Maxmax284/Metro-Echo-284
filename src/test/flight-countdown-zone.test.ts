// The countdown over the Pacific.
//
// What is being held to account here:
//   - A provider's times are airport wall clocks with no zone on them. Parsed on
//     a phone that is still set to the city you left, a Taipei landing reads
//     hours further away than it is. Live readings are pinned to the airport they
//     belong to before anything counts down from them.
//   - The reading is pinned wherever the device thinks it is: the same snapshot
//     must give the same time left in Washington, in Taipei and mid-ocean.
//   - A landing that lands on the next calendar day at the far end still reads
//     as one flight, not as a day gained.
//   - A time that cannot be pinned — an airport Echo holds no zone for — is
//     called unknown rather than counted down from the phone's own clock.
import { afterEach, describe, expect, it } from "vitest";
import type { FlightPlan } from "@/lib/flightPlan";
import { anchorLive, isPinned, type LiveFlight } from "@/lib/flightStatus";
import { bigNumbers, journeysFrom } from "@/lib/journey";

/* The live flight as the feed actually filed it on the night in question: wall
   clocks, no zone, Dulles at one end and Taoyuan at the other. */
const READING = {
  flight_no: "BR3",
  airline: "EVA Air",
  status: "active",
  departure: {
    airport: "Washington Dulles",
    iata: "IAD",
    terminal: null,
    gate: "B49",
    scheduled: "2026-09-19T01:15:00",
    estimated: null,
    actual: "2026-09-19T01:18:00",
    delay_min: 3,
  },
  arrival: {
    airport: "Taoyuan",
    iata: "TPE",
    terminal: "2",
    gate: "C6",
    scheduled: "2026-09-20T05:10:00",
    estimated: "2026-09-20T05:21:00",
    actual: null,
    delay_min: null,
  },
  checked_at: "2026-09-19T14:00:00.000Z",
};

function plan(live: unknown): FlightPlan {
  return {
    id: "live-leg",
    origin: "IAD",
    destination: "TPE",
    depart_on: "2026-09-19",
    return_on: null,
    passengers: 1,
    currency: "USD",
    source: "pasted" as FlightPlan["source"],
    options: [],
    chosen_option_id: null,
    status: "confirmed",
    event_ids: [],
    ownership: "mine",
    live_status: live,
    live_checked_at: READING.checked_at,
    leg_state: "in_air",
    leg_state_source: "you",
    leg_state_at: "2026-09-19T06:00:00.000Z",
  } as FlightPlan;
}

/** 4h 11m before the pinned landing: 05:21 in Taipei is 21:21 UTC the day before. */
const NOW = new Date("2026-09-19T17:10:00.000Z");

function timeLeftWith(tz: string) {
  process.env.TZ = tz;
  const journeys = journeysFrom([plan(READING)]);
  return bigNumbers(journeys[0], NOW);
}

afterEach(() => {
  process.env.TZ = "UTC";
});

describe("the countdown to a landing in another zone", () => {
  it("counts down to the landing where it happens, not where the phone was set", () => {
    const numbers = timeLeftWith("America/New_York");
    expect(numbers.timeLeft).toBe("4h 11m");
    expect(numbers.timeLeftLabel).toBe("until you land, on the filed times");
  });

  it("gives the same time left on a phone still on the city you left and one on arrival time", () => {
    const home = timeLeftWith("America/New_York").timeLeft;
    const there = timeLeftWith("Asia/Taipei").timeLeft;
    const nowhere = timeLeftWith("UTC").timeLeft;
    expect(home).toBe("4h 11m");
    expect(there).toBe(home);
    expect(nowhere).toBe(home);
  });

  it("keeps the arrival gate the feed filed while it is doing so", () => {
    expect(timeLeftWith("America/New_York").gate).toBe("C6");
  });

  it("pins a wall clock to the airport it belongs to and leaves a pinned one alone", () => {
    const pinned = anchorLive(READING as unknown as LiveFlight)!;
    expect(pinned.arrival.estimated).toBe("2026-09-19T21:21:00.000Z");
    expect(pinned.departure.actual).toBe("2026-09-19T05:18:00.000Z");
    expect(anchorLive(pinned).arrival.estimated).toBe(pinned.arrival.estimated);
    expect(isPinned(pinned.arrival.estimated)).toBe(true);
    expect(isPinned(READING.arrival.estimated)).toBe(false);
  });

  it("reads the far end on the next calendar day without gaining a day of flying", () => {
    const pinned = anchorLive(READING as unknown as LiveFlight)!;
    const hours =
      (Date.parse(pinned.arrival.estimated!) - Date.parse(pinned.departure.actual!)) / 3_600_000;
    expect(Math.round(hours)).toBe(16);
  });

  it("says a landing time is not pinned rather than counting down from the phone's zone", () => {
    process.env.TZ = "America/New_York";
    const unknown = {
      ...READING,
      arrival: { ...READING.arrival, iata: "ZZZ", airport: "Somewhere Echo has no zone for" },
    };
    const journeys = journeysFrom([plan(unknown)]);
    const numbers = bigNumbers(journeys[0], NOW);
    expect(numbers.timeLeft).toBeNull();
    expect(numbers.timeLeftLabel).toBe("landing time not pinned to a timezone");
  });

  it("runs the countdown off the cabin screen when the traveller read one", () => {
    process.env.TZ = "America/New_York";
    const journeys = journeysFrom([plan(READING)]);
    /* 05:40 in Taipei, the number on the seat-back: 30 minutes past the feed's. */
    const numbers = bigNumbers(journeys[0], NOW, "2026-09-19T21:40:00.000Z");
    expect(numbers.timeLeft).toBe("4h 30m");
    expect(numbers.timeLeftLabel).toBe("until you land, on the cabin screen");
  });
});
