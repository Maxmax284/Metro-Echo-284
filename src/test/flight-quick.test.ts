// A flight put in by hand: a number and a day, nothing invented, nothing doubled.
import { describe, expect, it } from "vitest";
import {
  bareOption,
  bareWords,
  fillFromLive,
  findSameFlight,
  isSameFlight,
  liveAddedSomething,
  quickVerdict,
  readFlightNo,
  routeFromLive,
} from "@/lib/flightQuick";
import { canConfirm, confirmedEntries, optionWords, sortOptions, type FlightPlan } from "@/lib/flightPlan";
import type { LiveFlight } from "@/lib/flightStatus";

function plan(over: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: "p1",
    origin: "",
    destination: "",
    depart_on: "2026-10-03",
    return_on: null,
    passengers: 1,
    currency: null,
    source: "entered",
    options: [bareOption("TG601", "2026-10-03")],
    chosen_option_id: null,
    status: "prepared",
    event_ids: [],
    ...over,
  };
}

function live(over: Partial<LiveFlight> = {}): LiveFlight {
  const end = { airport: null, iata: null, terminal: null, gate: null, scheduled: null, estimated: null, actual: null, delay_min: null };
  return {
    flight_no: "TG601",
    flight_date: "2026-10-03",
    airline: "Thai Airways",
    status: "scheduled",
    departure: { ...end, iata: "JFK", scheduled: "2026-10-03T08:45:00+00:00" },
    arrival: { ...end, iata: "BKK", scheduled: "2026-10-04T12:20:00+00:00" },
    checked_at: "2026-10-01T10:00:00.000Z",
    ...over,
  };
}

describe("reading a flight number", () => {
  it("takes it however a person writes it", () => {
    expect(readFlightNo("tg601")).toBe("TG601");
    expect(readFlightNo("TG 601")).toBe("TG601");
    expect(readFlightNo("tg-601")).toBe("TG601");
    expect(readFlightNo(" U2 2490 ")).toBe("U22490");
    expect(readFlightNo("3K 205")).toBe("3K205");
  });

  it("drops the airline's leading zeros so one flight is one flight", () => {
    expect(readFlightNo("TG0601")).toBe("TG601");
  });

  it("refuses what is not a flight number rather than guessing", () => {
    expect(readFlightNo("")).toBeNull();
    expect(readFlightNo("601")).toBeNull();
    expect(readFlightNo("TG")).toBeNull();
    expect(readFlightNo("TG60123")).toBeNull();
    expect(readFlightNo("TG000")).toBeNull();
    expect(readFlightNo("my flight to bangkok")).toBeNull();
  });
});

describe("what the box demands", () => {
  it("takes a number and a day", () => {
    expect(quickVerdict("tg 601", "2026-10-03")).toEqual({ ok: true, flight_no: "TG601" });
  });

  it("will not pick a day for you", () => {
    const v = quickVerdict("TG601", "");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/day it leaves/i);
  });

  it("says plainly when the number is not one", () => {
    const v = quickVerdict("bangkok", "2026-10-03");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/TG601/);
  });

  it("refuses a half-written date", () => {
    expect(quickVerdict("TG601", "2026-10").ok).toBe(false);
  });
});

describe("a bare flight stays bare", () => {
  it("carries no time, no price, no route", () => {
    const o = bareOption("TG601", "2026-10-03");
    expect(o.depart_at).toBeNull();
    expect(o.arrive_at).toBeNull();
    expect(o.price).toBeNull();
    expect(o.flight_no).toBe("TG601");
  });

  it("says it has no times rather than showing midnight", () => {
    const words = optionWords(bareOption("TG601", "2026-10-03"));
    expect(words).toMatch(/no times recorded yet/);
    expect(words).not.toMatch(/00:00/);
  });

  it("cannot be confirmed onto a day", () => {
    const p = plan();
    const v = canConfirm(p, p.options[0].id);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/no departure time/i);
  });

  it("writes no board entry without a time", () => {
    const p = plan();
    expect(confirmedEntries(p, p.options[0])).toEqual([]);
  });

  it("sits after the flights that do have times", () => {
    const timed = { ...bareOption("EK385", "2026-10-03"), depart_at: "2026-10-03T22:10:00" };
    const order = sortOptions([bareOption("TG601", "2026-10-03"), timed]).map((o) => o.flight_no);
    expect(order).toEqual(["EK385", "TG601"]);
  });

  it("says what it is without dressing it up", () => {
    expect(bareWords("TG601", "2026-10-03")).toMatch(/nothing else on it yet/);
  });
});

describe("one flight, one card", () => {
  it("matches the same number on the same day", () => {
    expect(isSameFlight(plan(), "TG601", "2026-10-03")).toBe(true);
  });

  it("is a different flight on a different day", () => {
    expect(isSameFlight(plan(), "TG601", "2026-10-04")).toBe(false);
  });

  it("does not count a dropped plan", () => {
    expect(isSameFlight(plan({ status: "dropped" }), "TG601", "2026-10-03")).toBe(false);
  });

  it("finds a flight Echo noticed, not just one typed at the desk", () => {
    const noticed = plan({ id: "p2", origin_kind: "recognised", ownership: "unknown" });
    expect(findSameFlight([noticed], "TG601", "2026-10-03")?.id).toBe("p2");
  });

  it("hands back nothing for a genuinely new flight", () => {
    expect(findSameFlight([plan()], "EK385", "2026-10-03")).toBeNull();
  });
});

describe("what the provider adds, and only that", () => {
  it("fills the times and the airline it carried", () => {
    const filled = fillFromLive(bareOption("TG601", "2026-10-03"), live());
    expect(filled.depart_at).toBe("2026-10-03T08:45:00+00:00");
    expect(filled.arrive_at).toBe("2026-10-04T12:20:00+00:00");
    expect(filled.airline).toBe("Thai Airways");
    expect(filled.note).toBeNull();
  });

  it("leaves a missing arrival missing", () => {
    const l = live({ arrival: { ...live().arrival, scheduled: null, estimated: null } });
    expect(fillFromLive(bareOption("TG601", "2026-10-03"), l).arrive_at).toBeNull();
  });

  it("changes nothing when the provider knew nothing", () => {
    const o = bareOption("TG601", "2026-10-03");
    expect(fillFromLive(o, null)).toEqual(o);
    expect(liveAddedSomething(null)).toBe(false);
  });

  it("names the two ends only as the provider named them", () => {
    expect(routeFromLive(live())).toEqual({ origin: "JFK", destination: "BKK" });
    expect(routeFromLive(null)).toEqual({ origin: "", destination: "" });
  });
});
