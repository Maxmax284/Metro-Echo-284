import { describe, it, expect } from "vitest";
import { lifeAnswer, lifeDomains, lifeLine, matchLifeQuestion } from "@/lib/streetSmart";
import { convert, crossRate, formatMoney, moneyAnswer, parseMoneyAsk, toCode, type Rates } from "@/lib/currency";
import { helpAnswer, helpFor } from "@/lib/localHelp";
import { formatBody, latestPerKind, readingLine } from "@/lib/bodyRead";

const NONE = {
  bank: false, rates: false, flights: false, place: false, body: false, whatsapp: false, calendar: false,
};

describe("everyday life — no fake capability", () => {
  it("marks nothing live when nothing is connected", () => {
    const rows = lifeDomains(NONE).filter((r) => r.id !== "ground_help");
    expect(rows.every((r) => r.state !== "live")).toBe(true);
  });

  it("always says how help works, connected or not", () => {
    const help = lifeDomains(NONE).find((r) => r.id === "ground_help")!;
    expect(help.state).toBe("live");
    expect(help.limit).toMatch(/never dials/i);
  });

  it("gives the real reason and what it needs when waiting", () => {
    const bank = lifeDomains(NONE).find((r) => r.id === "money_bank")!;
    expect(bank.state).toBe("needs_connecting");
    expect(bank.because).toMatch(/no bank rail/i);
    expect(bank.needs).toMatch(/plaid/i);
    expect(bank.limit).toMatch(/never move money/i);
  });

  it("goes live only off a recorded fact", () => {
    const rows = lifeDomains({ ...NONE, body: true, calendar: true, rates: true });
    expect(rows.find((r) => r.id === "body")!.state).toBe("live");
    expect(rows.find((r) => r.id === "ground_roof")!.state).toBe("live");
    expect(rows.find((r) => r.id === "move_flight")!.state).toBe("needs_connecting");
  });

  it("counts honestly in one line and never promises a waiting row", () => {
    const rows = lifeDomains({ ...NONE, rates: true });
    expect(lifeLine(rows)).toMatch(/2 everyday things Echo can read now/);
    expect(lifeAnswer(rows)).toMatch(/Nothing on this list acts on its own\./);
  });

  it("knows when it is being asked about everyday life", () => {
    expect(matchLifeQuestion("can you see my bank?")).toBe(true);
    expect(matchLifeQuestion("what's due tomorrow")).toBe(false);
  });
});

const RATES: Rates = {
  base: "USD",
  rates: { USD: 1, THB: 32, EUR: 0.9 },
  readAt: "2026-09-16T10:00:00.000Z",
};

describe("money — a rate travels with every number", () => {
  it("reads ordinary words into a conversion", () => {
    expect(parseMoneyAsk("what's 50 usd in baht")).toEqual({ amount: 50, from: "USD", to: "THB" });
    expect(parseMoneyAsk("£40 to euros")).toEqual({ amount: 40, from: "GBP", to: "EUR" });
    expect(parseMoneyAsk("how are you")).toBeNull();
    expect(parseMoneyAsk("50 usd in usd")).toBeNull();
  });

  it("normalises codes, words and symbols", () => {
    expect(toCode("dollars")).toBe("USD");
    expect(toCode("฿")).toBe("THB");
    expect(toCode("zzz9")).toBe("ZZZ");
    expect(toCode("")).toBeNull();
  });

  it("crosses through the table's base", () => {
    expect(crossRate("THB", "EUR", RATES)).toBeCloseTo(0.028125, 6);
    expect(convert(100, "USD", "THB", RATES)).toBe(3200);
    expect(crossRate("USD", "XYZ", RATES)).toBeNull();
  });

  it("says the rate and when it was read", () => {
    const line = moneyAnswer({ amount: 50, from: "USD", to: "THB" }, RATES);
    expect(line).toContain("1 USD = 32.0000 THB");
    expect(line).toContain("2026-09-16 10:00 UTC");
    expect(line).toMatch(/not what a card/i);
  });

  it("gives no number at all when the rates could not be read", () => {
    const line = moneyAnswer({ amount: 50, from: "USD", to: "THB" }, null);
    expect(line).toMatch(/could not be read/i);
    expect(line).not.toMatch(/\d,\d|1,600/);
  });

  it("formats whole-unit currencies without cents", () => {
    expect(formatMoney(1200, "JPY")).toBe("¥1,200");
    expect(formatMoney(12.5, "USD")).toBe("$12.50");
  });
});

describe("local help — the number or nothing", () => {
  it("gives the published number for a country it knows", () => {
    expect(helpFor("Thailand")?.general).toBe("191");
    expect(helpFor("us")?.general).toBe("911");
    expect(helpAnswer("Thailand")).toMatch(/1669/);
  });

  it("answers 112 across the EU with one rule", () => {
    expect(helpFor("France")?.general).toBe("112");
    expect(helpAnswer("Portugal")).toMatch(/112/);
  });

  it("refuses to guess a country it was never told about", () => {
    const line = helpAnswer("Wakanda");
    expect(line).toMatch(/does not have a recorded emergency number/i);
    expect(line).not.toMatch(/\b911\b|\b112\b/);
  });

  it("says it does not know the country rather than picking one", () => {
    expect(helpAnswer("")).toMatch(/does not know which country/i);
  });

  it("never claims it can call", () => {
    expect(helpAnswer("United States")).toMatch(/cannot make the call for you/i);
  });
});

describe("body — recorded numbers only", () => {
  it("says plainly when nothing was recorded", () => {
    expect(formatBody([], 7)).toMatch(/No readings from a watch in the last 7 days/);
  });

  it("keeps the newest reading per kind", () => {
    const rows = [
      { kind: "hr", value: 60, unit: "bpm", measured_at: "2026-09-15T10:00:00.000Z" },
      { kind: "hr", value: 66, unit: "bpm", measured_at: "2026-09-16T10:00:00.000Z" },
    ];
    expect(latestPerKind(rows).map((r) => r.value)).toEqual([66]);
  });

  it("reads sleep in hours and minutes", () => {
    expect(readingLine({ kind: "sleep_minutes", value: 445, unit: null, measured_at: "" })).toBe("sleep 7h 25m");
  });

  it("never offers an opinion", () => {
    const line = formatBody(
      [{ kind: "hr", value: 66, unit: "bpm", measured_at: new Date().toISOString() }],
      7,
    );
    expect(line).toMatch(/not a health opinion/i);
  });
});
