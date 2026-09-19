// flight doctrine — the twelve journey scenarios from the flight audit, held to
// account against the real modules rather than the UI.
//
// The single law underneath all of them: interpret the journey for the traveller
// without inventing certainty, and never make them second-guess the platform.
import { describe, expect, it } from "vitest";
import type { FlightPlan } from "@/lib/flightPlan";
import { bigNumbers, journeysFrom, legOf, legState, whereOnJourney } from "@/lib/journey";
import { carryFiled, readingAge, statusDiff, type LiveFlight } from "@/lib/flightStatus";
import { groundPath } from "@/lib/groundPath";
import { connectionAt } from "@/lib/connectionRead";

/* A departure out of Dulles at 21:15 local, landing in Taipei two days on.
   Times are the wall clock at each airport, which is how a ticket reads. */
function live(o: {
  from: string;
  to: string;
  depScheduled?: string | null;
  depActual?: string | null;
  arrScheduled?: string | null;
  arrActual?: string | null;
  status?: string;
  depGate?: string | null;
  depTerminal?: string | null;
  checkedAt?: string;
}): LiveFlight {
  return {
    flight_no: "BR3",
    flight_date: "2026-09-19",
    airline: "EVA Air",
    status: o.status ?? "scheduled",
    departure: {
      airport: "Dulles",
      iata: o.from,
      terminal: o.depTerminal ?? null,
      gate: o.depGate ?? null,
      scheduled: o.depScheduled ?? null,
      estimated: null,
      actual: o.depActual ?? null,
      delay_min: null,
    },
    arrival: {
      airport: "Taoyuan",
      iata: o.to,
      terminal: null,
      gate: null,
      scheduled: o.arrScheduled ?? null,
      estimated: null,
      actual: o.arrActual ?? null,
      delay_min: null,
    },
    checked_at: o.checkedAt ?? "2026-09-19T12:00:00Z",
  };
}

function plan(over: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: "p1",
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
    ...over,
  };
}

const dulles = (over: Partial<FlightPlan> = {}) =>
  plan({
    live_status: live({
      from: "IAD",
      to: "TPE",
      depScheduled: "2026-09-19T21:15:00",
      arrScheduled: "2026-09-21T05:10:00",
    }),
    ...over,
  });

describe("1 + 2 — a gate is never invented and never forgotten", () => {
  it("says plainly that no gate is filed, and then gives a next move", () => {
    const read = groundPath({
      where: "at_airport",
      identity: null,
      fromPlace: "Dulles",
      toPlace: "Taipei",
      terminal: null,
      gate: null,
      minsToDeparture: 120,
      throughSecurity: true,
    });
    expect(read.step).toBe("gate_pending");
    expect(read.lead).toContain("No gate filed yet");
    expect(read.lead).toContain("departures board");
  });

  it("reports a real gate change as a change", () => {
    const first = live({ from: "IAD", to: "TPE", depGate: "B49", depScheduled: "2026-09-19T21:15:00" });
    const moved = live({
      from: "IAD",
      to: "TPE",
      depGate: "C7",
      depScheduled: "2026-09-19T21:15:00",
      checkedAt: "2026-09-19T13:00:00Z",
    });
    expect(statusDiff(first, carryFiled(first, moved))).toContain("C7");
  });

  it("keeps a verified gate when a later reading goes quiet, without calling it news", () => {
    const first = live({ from: "IAD", to: "TPE", depGate: "B49", depScheduled: "2026-09-19T21:15:00" });
    const quiet = live({ from: "IAD", to: "TPE", depScheduled: "2026-09-19T21:15:00", checkedAt: "2026-09-19T14:00:00Z" });
    const kept = carryFiled(first, quiet);
    expect(kept.departure.gate).toBe("B49");
    expect(statusDiff(first, kept)).toBeNull();
  });
});

describe("3 — the clock alone never moves you", () => {
  it("a scheduled departure passing is not a takeoff", () => {
    const leg = legOf(dulles());
    const s = legState(leg, new Date("2026-09-20T03:00:00Z"));
    expect(s.kind).toBe("at_airport");
    expect(s.source).toBe("the clock");
    expect(s.stale).toBe(true);
    expect(s.words).toContain("if you missed it, say so");
  });

  it("the traveller's word beats the feed, and says so", () => {
    const leg = legOf(dulles({ live_status: live({ from: "IAD", to: "TPE", depActual: "2026-09-19T21:20:00", status: "active" }), leg_state: "at_airport" }));
    const s = legState(leg, new Date("2026-09-20T03:00:00Z"));
    expect(s.kind).toBe("at_airport");
    expect(s.source).toBe("you");
  });

  it("a missed flight freezes everything after it", () => {
    const legs = [
      dulles({ id: "a", leg_state: "did_not_happen", leg_order: 0 }),
      plan({
        id: "b",
        origin: "TPE",
        destination: "BKK",
        leg_order: 1,
        live_status: live({
          from: "TPE",
          to: "BKK",
          depScheduled: "2026-09-21T09:00:00",
          arrScheduled: "2026-09-21T11:50:00",
        }),
      }),
    ];
    const where = whereOnJourney(journeysFrom(legs)[0], new Date("2026-09-21T10:00:00Z"));
    expect(where.kind).toBe("stopped");
    expect(where.words).toContain("on hold");
    expect(where.nextLeg).toBeNull();
    const ground = groundPath({
      where: "stopped",
      identity: null,
      fromPlace: "Dulles",
      toPlace: "Taipei",
      terminal: null,
      gate: null,
      minsToDeparture: null,
    });
    expect(ground.step).toBe("none");
    expect(ground.lead).toContain("on hold");
  });
});

describe("4 — guidance moves on with the traveller", () => {
  it("drops terminal errands once the pass is scanned", () => {
    const read = groundPath({
      where: "boarding",
      identity: null,
      fromPlace: "Dulles",
      toPlace: "Taipei",
      terminal: null,
      gate: "B49",
      minsToDeparture: 20,
    });
    expect(read.step).toBe("boarding");
    expect(read.lead).toContain("Nothing left to do in the terminal");
    expect(read.needsCheckIn).toBe(false);
  });

  it("in the air, the next move is the arrival, not check-in", () => {
    const read = groundPath({
      where: "in_air",
      identity: null,
      fromPlace: "Dulles",
      toPlace: "Taipei",
      terminal: null,
      gate: null,
      minsToDeparture: -300,
    });
    expect(read.step).toBe("in_air");
    expect(read.lead).toContain("In the air to Taipei");
  });
});

describe("5 — staleness is said out loud", () => {
  it("ages a reading in plain words", () => {
    expect(readingAge("2026-09-19T12:00:00Z", new Date("2026-09-19T15:00:00Z"))).toMatch(/h/);
  });

  it("never claims a landing from a passed landing time", () => {
    const leg = legOf(
      dulles({
        live_status: live({
          from: "IAD",
          to: "TPE",
          depActual: "2026-09-19T21:20:00",
          arrScheduled: "2026-09-21T05:10:00",
          status: "active",
        }),
      }),
    );
    const s = legState(leg, new Date("2026-09-21T00:00:00Z"));
    expect(s.kind).toBe("in_air");
    expect(s.stale).toBe(true);
    expect(s.words).toContain("not that you have landed");
  });
});

describe("7 — times stay in the local clock of their own airport", () => {
  it("keeps a late-night departure on its own calendar day across the date line", () => {
    const leg = legOf(
      dulles({
        options: [
          {
            id: "o1",
            airline: "EVA Air",
            flight_no: "BR3",
            depart_at: "2026-09-19T21:15:00",
            arrive_at: "2026-09-21T05:10:00",
            price: null,
            currency: "USD",
          } as never,
        ],
        live_status: null,
      }),
    );
    // 21:15 at Dulles is 01:15Z the next day; 05:10 in Taipei is 21:10Z the day before.
    expect(new Date(leg.from.at!).toISOString()).toBe("2026-09-20T01:15:00.000Z");
    expect(new Date(leg.to.at!).toISOString()).toBe("2026-09-20T21:10:00.000Z");
  });
});

describe("8 — connecting and entering passengers get different answers", () => {
  const legs = () => [
    legOf(
      plan({
        id: "a",
        origin: "IAD",
        destination: "TPE",
        live_status: live({ from: "IAD", to: "TPE", depActual: "2026-09-19T21:20:00", arrActual: "2026-09-21T05:05:00" }),
      }),
      0,
    ),
    legOf(
      plan({
        id: "b",
        origin: "TPE",
        destination: "BKK",
        live_status: live({ from: "TPE", to: "BKK", depScheduled: "2026-09-21T09:00:00", arrScheduled: "2026-09-21T11:50:00" }),
      }),
      1,
    ),
  ];

  it("answers the transfer when another leg follows", () => {
    const read = connectionAt(legs(), 0, new Date("2026-09-21T01:10:00Z"));
    expect(read).not.toBeNull();
    expect(read!.lead).toContain("Connecting");
    expect(read!.detail.length).toBeGreaterThan(0);
  });

  it("keeps the city notes for the last leg of the journey", () => {
    expect(connectionAt(legs(), 1, new Date("2026-09-21T04:00:00Z"))).toBeNull();
  });
});

describe("9 + 10 — one version of the truth, in one order", () => {
  it("in the air, the big number is the landing and the label says whose number it is", () => {
    const journey = journeysFrom([
      dulles({
        live_status: live({
          from: "IAD",
          to: "TPE",
          depActual: "2026-09-19T21:20:00",
          arrScheduled: "2026-09-21T05:10:00",
          status: "active",
        }),
      }),
    ])[0];
    const now = new Date("2026-09-20T12:00:00Z");
    const filed = bigNumbers(journey, now);
    expect(filed.timeLeftLabel).toBe("until you land, on the filed times");
    const cabin = bigNumbers(journey, now, "2026-09-21T05:40:00+08:00");
    expect(cabin.timeLeftLabel).toBe("until you land, on the cabin screen");
    expect(cabin.timeLeft).not.toBe(filed.timeLeft);
  });

  it("never shows a negative countdown", () => {
    const journey = journeysFrom([
      dulles({
        live_status: live({
          from: "IAD",
          to: "TPE",
          depActual: "2026-09-19T21:20:00",
          arrScheduled: "2026-09-21T05:10:00",
          status: "active",
        }),
      }),
    ])[0];
    expect(bigNumbers(journey, new Date("2026-09-22T00:00:00Z")).timeLeft).toBeNull();
  });

  it("a finished journey gives no countdown at all", () => {
    const journey = journeysFrom([dulles({ leg_state: "landed" })])[0];
    const where = whereOnJourney(journey, new Date("2026-09-21T00:00:00Z"));
    expect(where.kind).toBe("done");
    expect(bigNumbers(journey, new Date("2026-09-21T00:00:00Z")).timeLeft).toBeNull();
  });
});

describe("provider unavailable", () => {
  it("falls back to what is on the record without inventing a status", () => {
    const leg = legOf(
      dulles({
        live_status: null,
        options: [
          {
            id: "o1",
            airline: "EVA Air",
            flight_no: "BR3",
            depart_at: "2026-09-19T21:15:00",
            arrive_at: "2026-09-21T05:10:00",
            price: null,
            currency: "USD",
          } as never,
        ],
      }),
    );
    expect(leg.from.basis).toBe("recorded");
    expect(leg.filed_status).toBeNull();
    expect(leg.from.gate).toBeNull();
  });
});
