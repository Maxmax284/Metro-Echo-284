// A time off your own ticket, on a flight no feed carries.
import { describe, expect, it } from "vitest";
import { readClock, saidTime, saidTimeWords } from "@/lib/flightSaidTime";
import { planSourceWords } from "@/lib/flightPlan";
import type { FlightOption, FlightPlan } from "@/lib/flightPlan";

function option(over: Partial<FlightOption> = {}): FlightOption {
  return {
    id: "TG637-2026-09-20",
    airline: "TG",
    flight_no: "TG637",
    depart_at: null,
    arrive_at: null,
    price: null,
    currency: null,
    stops: null,
    note: "added by number, no times on record yet",
    ...over,
  } as FlightOption;
}

function plan(over: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: "p1",
    origin: "TPE",
    destination: "BKK",
    depart_on: "2026-09-20",
    return_on: null,
    passengers: 1,
    currency: null,
    source: "entered",
    options: [option()],
    chosen_option_id: "TG637-2026-09-20",
    status: "prepared",
    event_ids: [],
    created_at: "2026-09-19T00:00:00Z",
    ...over,
  } as FlightPlan;
}

describe("readClock", () => {
  it("reads the ways a ticket writes a time", () => {
    expect(readClock("07:15")).toBe("07:15");
    expect(readClock("7:15 am")).toBe("07:15");
    expect(readClock("0755")).toBe("07:55");
    expect(readClock("7.55pm")).toBe("19:55");
    expect(readClock("12:10 am")).toBe("00:10");
  });

  it("refuses what is not a time instead of guessing one", () => {
    expect(readClock("")).toBeNull();
    expect(readClock("soon")).toBeNull();
    expect(readClock("25:00")).toBeNull();
    expect(readClock("07:75")).toBeNull();
  });
});

describe("saidTime", () => {
  it("keeps the wall clock on the filed day with no zone attached", () => {
    const read = saidTime("07:55", "2026-09-20", "departure");
    expect(read.ok).toBe(true);
    expect(read.said?.at).toBe("2026-09-20T07:55:00");
    expect(read.said?.hhmm).toBe("07:55");
  });

  it("never turns a boarding time into a departure time", () => {
    const read = saidTime("07:15", "2026-09-20", "boarding");
    expect(read.said?.kind).toBe("boarding");
    expect(read.said?.at).toBe("2026-09-20T07:15:00");
    expect(read.said?.words).toMatch(/counts from boarding/i);
    expect(read.said?.note).toMatch(/departure not filed/i);
  });

  it("refuses a time when there is no day to sit it on", () => {
    const read = saidTime("07:15", null);
    expect(read.ok).toBe(false);
    expect(read.reason).toMatch(/no day on record/i);
  });

  it("explains an unreadable time plainly", () => {
    expect(saidTime("whenever", "2026-09-20").reason).toMatch(/does not read as a time/i);
  });

  it("says where a saved time came from", () => {
    expect(saidTimeWords("boarding", "07:15")).toMatch(/filed no departure time/i);
    expect(saidTimeWords("departure", "07:55")).toMatch(/off your own ticket/i);
  });
});

describe("source copy after a ticket time", () => {
  it("says a time is still needed before one is given", () => {
    expect(planSourceWords(plan())).toMatch(/departure time still needed/i);
  });

  it("credits your ticket once a departure time is on record", () => {
    const p = plan({
      options: [
        option({
          depart_at: "2026-09-20T07:55:00",
          said_time: { kind: "departure", hhmm: "07:55", by: "you", at: "2026-09-19T12:00:00Z" },
        }),
      ],
    });
    expect(planSourceWords(p)).toMatch(/07:55 read off your own ticket/i);
  });

  it("does not claim an airline departure when only boarding was given", () => {
    const p = plan({
      options: [
        option({
          depart_at: "2026-09-20T07:15:00",
          said_time: { kind: "boarding", hhmm: "07:15", by: "you", at: "2026-09-19T12:00:00Z" },
        }),
      ],
    });
    const words = planSourceWords(p);
    expect(words).toMatch(/boarding time 07:15/i);
    expect(words).toMatch(/has not filed a take-off time/i);
  });
});
