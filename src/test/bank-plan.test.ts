import { describe, expect, it } from "vitest";
import {
  accountWords,
  dayMoney,
  dayMoneyLine,
  money,
  planWords,
  spendPlan,
  totalsByCurrency,
  txnsOn,
  type BankAccount,
  type BankTxn,
} from "@/lib/bankPlan";

const acct = (over: Partial<BankAccount> = {}): BankAccount => ({
  account_id: "a1",
  name: "Everyday",
  mask: "1234",
  type: "depository",
  subtype: "checking",
  current: 1200,
  available: 1180,
  currency: "USD",
  ...over,
});

const txn = (over: Partial<BankTxn> = {}): BankTxn => ({
  transaction_id: Math.random().toString(36).slice(2),
  account_id: "a1",
  amount: 20,
  currency: "USD",
  date: "2026-09-10",
  name: "Coffee",
  pending: false,
  ...over,
});

describe("money is reported in the currency the bank recorded", () => {
  it("never sums across currencies", () => {
    const totals = totalsByCurrency([acct(), acct({ account_id: "a2", currency: "EUR", current: 300 })]);
    expect(totals).toHaveLength(2);
    expect(totals.find((t) => t.currency === "EUR")?.current).toBe(300);
  });

  it("treats a missing balance as missing, not as zero", () => {
    const totals = totalsByCurrency([acct({ current: null })]);
    expect(totals).toHaveLength(0);
    expect(accountWords(acct({ current: null }))).toContain("no balance given");
  });

  it("writes an amount with two places and its own currency", () => {
    expect(money(1200, "USD")).toBe("$1,200.00");
    expect(money(45.5, "THB")).toContain("฿");
    expect(money(10, "XYZ")).toContain("XYZ");
  });
});

describe("a day says what left and what arrived", () => {
  const txns = [
    txn({ amount: 20, name: "Coffee" }),
    txn({ amount: 120, name: "Groceries" }),
    txn({ amount: -900, name: "Payroll" }),
    txn({ amount: 15, date: "2026-09-11", name: "Bus" }),
  ];

  it("keeps a day to its own entries", () => {
    expect(txnsOn(txns, "2026-09-10")).toHaveLength(3);
    expect(txnsOn(txns, "2026-09-12")).toHaveLength(0);
  });

  it("counts money out and money in separately", () => {
    const [d] = dayMoney(txns, "2026-09-10");
    expect(d.out).toBe(140);
    expect(d.in).toBe(900);
    expect(d.count).toBe(3);
  });

  it("says nothing at all for a day the bank recorded nothing on", () => {
    expect(dayMoneyLine(txns, "2026-09-12")).toBe("");
    expect(dayMoneyLine(txns, "2026-09-10")).toContain("out");
  });
});

describe("a plan is arithmetic, never advice", () => {
  it("uses the window it was given and leaves pending entries out", () => {
    const txns = [txn({ amount: 100 }), txn({ amount: 100, pending: true })];
    const [p] = spendPlan(txns, [acct({ current: 1000 })], 10);
    expect(p.spent).toBe(100);
    expect(p.perDay).toBe(10);
    expect(p.daysCovered).toBe(100);
    expect(planWords(p)).toContain("last 10 days");
    expect(planWords(p).toLowerCase()).not.toMatch(/should|too much|budget better|advise/);
  });

  it("carries nothing forward when nothing went out", () => {
    const [p] = spendPlan([txn({ amount: -500, name: "Payroll" })], [acct({ current: 500 })], 30);
    expect(p.spent).toBe(0);
    expect(p.daysCovered).toBeNull();
    expect(planWords(p)).toContain("no rate to carry forward");
  });

  it("plans per currency and reports no window as no plan", () => {
    const mixed = [txn({ amount: 50 }), txn({ amount: 30, currency: "EUR" })];
    expect(spendPlan(mixed, [acct()], 7)).toHaveLength(2);
    expect(spendPlan(mixed, [acct()], 0)).toHaveLength(0);
  });
});
