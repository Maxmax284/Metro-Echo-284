import { describe, expect, it } from "vitest";
import {
  HOUSING_LAW,
  LEASE_CHECKS,
  comparePlaces,
  costWords,
  housingAnswer,
  leaseWords,
  readCost,
  type Place,
} from "@/lib/housing";

const flat = (over: Partial<Place> = {}): Place => ({
  label: "Sukhumvit 31",
  currency: "THB",
  termMonths: 12,
  recurring: { rent: 30000, utilities: 2000, internet: 700 },
  oneOff: { deposit: 60000, agency_fee: 15000 },
  ...over,
});

describe("housing — recurring money", () => {
  it("adds only the lines that were given", () => {
    const r = readCost(flat());
    expect(r.monthly).toBe(32700);
    expect(r.given.map((g) => g.line)).toEqual(["rent", "utilities", "internet"]);
  });

  it("names missing lines instead of treating them as free", () => {
    const r = readCost(flat());
    expect(r.unwritten).toContain("commute");
    expect(costWords(flat())).toContain("missing, not free");
  });

  it("has no monthly cost at all when nothing recurring is written down", () => {
    const r = readCost({ label: "Nowhere" });
    expect(r.monthly).toBeNull();
    expect(costWords({ label: "Nowhere" })).toContain("no monthly cost to work out");
  });
});

describe("housing — one-off cash", () => {
  it("keeps move-in cash separate from the monthly number", () => {
    const r = readCost(flat());
    expect(r.upfront).toBe(75000);
    expect(r.monthly).toBe(32700);
  });

  it("treats a returnable deposit as returnable and the fee as gone", () => {
    const r = readCost(flat());
    expect(r.sunkUpfront).toBe(15000);
    expect(r.trueMonthly).toBe(32700 + 15000 / 12);
  });

  it("counts a deposit you will not see again as sunk", () => {
    const r = readCost(flat({ depositReturned: false }));
    expect(r.sunkUpfront).toBe(75000);
  });

  it("does not spread anything when no term is known", () => {
    const r = readCost(flat({ termMonths: null }));
    expect(r.trueMonthly).toBe(r.monthly);
  });
});

describe("housing — comparing places", () => {
  it("refuses to add across currencies", () => {
    const c = comparePlaces([flat(), flat({ label: "Lisbon", currency: "EUR" })]);
    expect(c.cheaper).toBeNull();
    expect(c.blocked).toContain("different money");
  });

  it("will not call one place a comparison", () => {
    expect(comparePlaces([flat()]).blocked).toContain("not a comparison");
    expect(housingAnswer([flat()])).toContain("a month");
  });

  it("will not weigh a place with nothing written down", () => {
    const c = comparePlaces([flat(), { label: "Empty", currency: "THB" }]);
    expect(c.cheaper).toBeNull();
    expect(c.blocked).toContain("nothing to weigh it against");
  });

  it("picks the lower true monthly and says the gap", () => {
    const c = comparePlaces([
      flat(),
      flat({ label: "Ari", recurring: { rent: 25000 }, oneOff: { deposit: 50000 } }),
    ]);
    expect(c.cheaper?.label).toBe("Ari");
    expect(c.gapMonthly).toBeGreaterThan(0);
    expect(housingAnswer([flat(), flat({ label: "Ari", recurring: { rent: 25000 } })])).toContain(
      "a month cheaper",
    );
  });

  it("carries the standing law on every answer", () => {
    expect(housingAnswer([])).toContain(HOUSING_LAW);
    expect(costWords(flat())).toContain(HOUSING_LAW);
  });

  it("repeats what the person noticed, and never invents a landlord", () => {
    const text = costWords(flat({ notes: ["landlord took a week to answer"] }));
    expect(text).toContain("What you noticed yourself");
    expect(text.toLowerCase()).not.toContain("reviews");
  });
});

describe("housing — the lease", () => {
  it("asks questions and never answers them", () => {
    const text = leaseWords();
    for (const q of LEASE_CHECKS) expect(text).toContain(q);
    expect(text).toContain("The contract in your hand gives the answers");
  });
});
