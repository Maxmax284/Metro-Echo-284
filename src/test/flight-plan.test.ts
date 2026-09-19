import { describe, expect, it } from "vitest";
import {
  FLIGHT_LAW,
  canConfirm,
  cheapest,
  confirmedEntries,
  durationWords,
  fastest,
  parseQuote,
  planTitle,
  planSourceWords,
  planWords,
  priceWords,
  type FlightOption,
  type FlightPlan,
} from "@/lib/flightPlan";

const option = (over: Partial<FlightOption> = {}): FlightOption => ({
  id: "TG601-08:45",
  airline: "TG",
  flight_no: "TG601",
  depart_at: "2026-04-02T08:45:00",
  arrive_at: "2026-04-02T12:20:00",
  stops: 0,
  price: 412,
  currency: "USD",
  note: null,
  ...over,
});

const plan = (over: Partial<FlightPlan> = {}): FlightPlan => ({
  id: "p1",
  origin: "JFK",
  destination: "BKK",
  depart_on: "2026-04-02",
  return_on: null,
  passengers: 1,
  currency: "USD",
  source: "pasted",
  status: "prepared",
  options: [option()],
  chosen_option_id: null,
  event_ids: [],
  created_at: "2026-03-01T00:00:00Z",
  ...over,
});

describe("flightPlan", () => {
  it("reads a pasted line that carries a code and a time", () => {
    const { options, unread } = parseQuote("TG 601 · 08:45 → 12:20 · non-stop · $412", "2026-04-02");
    expect(unread).toHaveLength(0);
    expect(options[0].flight_no).toBe("TG601");
    expect(options[0].price).toBe(412);
    expect(options[0].currency).toBe("USD");
    expect(options[0].stops).toBe(0);
  });

  it("hands back a line it cannot read instead of guessing at it", () => {
    const { options, unread } = parseQuote("cheap flights to Bangkok, call for details", "2026-04-02");
    expect(options).toHaveLength(0);
    expect(unread).toHaveLength(1);
  });

  it("never invents a price when the line carries no currency or symbol", () => {
    const { options } = parseQuote("EK 385 · 22:10 → 18:05 · 1 stop", "2026-04-02");
    expect(options[0].price).toBeNull();
  });

  it("treats an arrival earlier on the clock as the next day", () => {
    const { options } = parseQuote("EK 385 · 22:10 → 18:05 · 1 stop", "2026-04-02");
    expect(options[0].arrive_at).toBe("2026-04-03T18:05:00");
  });

  it("says a missing duration is missing rather than zero", () => {
    expect(durationWords(null)).toBeNull();
    expect(durationWords(215)).toBe("3h 35m");
  });

  it("says a missing price is missing rather than free", () => {
    expect(priceWords(option({ price: null }))).toBeNull();
  });

  it("refuses to name a cheapest across two currencies", () => {
    const rows = [option({ id: "a", price: 300, currency: "USD" }), option({ id: "b", price: 200, currency: "EUR" })];
    expect(cheapest(rows)).toBeNull();
    expect(cheapest([rows[0], option({ id: "c", price: 250, currency: "USD" })])?.id).toBe("c");
  });

  it("picks the fastest only from options with a recorded arrival", () => {
    const rows = [option({ id: "a", arrive_at: null }), option({ id: "b" })];
    expect(fastest(rows)?.id).toBe("b");
  });

  it("refuses to confirm before an option is picked", () => {
    expect(canConfirm(plan(), null).ok).toBe(false);
    expect(canConfirm(plan(), "TG601-08:45").ok).toBe(true);
  });

  it("refuses to confirm a plan with no times on it", () => {
    const verdict = canConfirm(plan({ options: [] }), "x");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("nothing to confirm");
  });

  it("refuses to confirm the same flight twice", () => {
    expect(canConfirm(plan({ status: "confirmed" }), "TG601-08:45").ok).toBe(false);
  });

  it("writes a departure entry always and a landing entry only when recorded", () => {
    expect(confirmedEntries(plan(), option())).toHaveLength(2);
    expect(confirmedEntries(plan(), option({ arrive_at: null }))).toHaveLength(1);
  });

  it("puts the standing law and the price's origin on every board entry", () => {
    const [depart] = confirmedEntries(plan(), option());
    expect(depart.description).toContain(FLIGHT_LAW);
    expect(depart.description).toContain("you pasted");
  });

  it("says a confirmed flight was recorded, not bought", () => {
    const words = planWords(plan({ status: "confirmed", chosen_option_id: "TG601-08:45" }));
    expect(words).toContain("not bought");
  });

  it("says a prepared flight is waiting on a yes", () => {
    expect(planWords(plan())).toContain("Waiting on your yes");
  });

  it("says a dropped plan booked nothing", () => {
    expect(planWords(plan({ status: "dropped" }))).toContain("Nothing was booked");
  });

  it("describes a flight-number draft without claiming times or prices were typed", () => {
    const words = planSourceWords(plan({
      source: "entered",
      options: [option({ depart_at: null, arrive_at: null, price: null, currency: null })],
    }));
    expect(words).toBe("Added by flight number; departure time still needed.");
    expect(words).not.toMatch(/times|prices/);
  });

  it("uses recorded recognition provenance when a message supplied the flight", () => {
    expect(planSourceWords(plan({
      origin_kind: "recognised",
      noticed_from: { source: "email", source_words: "your synced Gmail" },
    }))).toBe("Read from your synced Gmail.");
  });

  it("titles a return trip with both dates", () => {
    expect(planTitle(plan({ return_on: "2026-04-19" }))).toContain("back 2026-04-19");
  });
});
