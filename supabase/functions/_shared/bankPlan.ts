// bankPlan — the rules for reading money, said once.
//
// Doctrine:
//   - Read only. Echo reports balances and transactions that a bank already
//     recorded. It never moves money, never pays, never transfers, and never
//     stages a payment as an action.
//   - Money is reported in the currency the bank recorded it in. Nothing is
//     silently converted; a mixed set is reported per currency.
//   - A plan is arithmetic on recorded amounts, never advice. It says what went
//     out and what is left across days that have actually happened.
//   - Pure module: no IO, so every rule below is testable.

export type BankAccount = {
  account_id: string;
  name: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  /** Current balance as the bank recorded it, or null when the bank gave none. */
  current: number | null;
  available: number | null;
  currency: string | null;
};

export type BankTxn = {
  transaction_id: string;
  account_id: string;
  /** Plaid convention: positive is money leaving the account. */
  amount: number;
  currency: string | null;
  date: string; // YYYY-MM-DD
  name: string;
  category?: string | null;
  pending?: boolean;
};

export const MONEY_LAW = "Read only. Echo shows what your bank recorded; it never moves money.";

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", THB: "฿", JPY: "¥" };

/** An amount in the currency the bank recorded it in. Never converted here. */
export function money(amount: number, currency: string | null): string {
  const code = (currency || "").toUpperCase();
  const sign = amount < 0 ? "-" : "";
  const size = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = SYMBOL[code];
  return sym ? `${sign}${sym}${size}` : `${sign}${size}${code ? ` ${code}` : ""}`;
}

/** Balances summed per currency, because summing across currencies is a lie. */
export function totalsByCurrency(accounts: BankAccount[]): Array<{ currency: string; current: number }> {
  const per = new Map<string, number>();
  for (const a of accounts) {
    if (a.current == null) continue; // a missing balance is not a zero
    const code = (a.currency || "").toUpperCase() || "—";
    per.set(code, (per.get(code) ?? 0) + a.current);
  }
  return [...per.entries()]
    .map(([currency, current]) => ({ currency, current }))
    .sort((a, b) => b.current - a.current);
}

/** One account in words, with what the bank actually gave. */
export function accountWords(a: BankAccount): string {
  const tail = a.mask ? ` ••${a.mask}` : "";
  const bal = a.current == null ? "no balance given" : money(a.current, a.currency);
  return `${a.name}${tail} — ${bal}`;
}

export function isSpend(t: BankTxn): boolean {
  return t.amount > 0;
}

/** Transactions on one calendar day, newest name order kept stable. */
export function txnsOn(txns: BankTxn[], day: string): BankTxn[] {
  return txns
    .filter((t) => t.date === day)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.name.localeCompare(b.name));
}

/** What left and what arrived on one day, per currency. Silence when nothing did. */
export function dayMoney(
  txns: BankTxn[],
  day: string,
): Array<{ currency: string; out: number; in: number; count: number }> {
  const per = new Map<string, { out: number; in: number; count: number }>();
  for (const t of txnsOn(txns, day)) {
    const code = (t.currency || "").toUpperCase() || "—";
    const slot = per.get(code) ?? { out: 0, in: 0, count: 0 };
    if (isSpend(t)) slot.out += t.amount;
    else slot.in += Math.abs(t.amount);
    slot.count += 1;
    per.set(code, slot);
  }
  return [...per.entries()].map(([currency, v]) => ({ currency, ...v }));
}

/** One line for a day on the board, or "" when that day recorded no money. */
export function dayMoneyLine(txns: BankTxn[], day: string): string {
  const parts = dayMoney(txns, day);
  if (!parts.length) return "";
  return parts
    .map((p) => {
      const bits: string[] = [];
      if (p.out > 0) bits.push(`${money(p.out, p.currency)} out`);
      if (p.in > 0) bits.push(`${money(p.in, p.currency)} in`);
      return `${bits.join(", ")} over ${p.count} ${p.count === 1 ? "entry" : "entries"}`;
    })
    .join("; ");
}

export type SpendPlan = {
  currency: string;
  days: number;
  spent: number;
  received: number;
  /** Average daily spend across the days actually covered. */
  perDay: number;
  /** Balance held in this currency, when the bank gave one. */
  balance: number | null;
  /** Days that balance covers at the observed rate, or null when unknowable. */
  daysCovered: number | null;
};

/**
 * A plan is arithmetic over the window the bank actually gave. It never
 * forecasts an unrecorded month and never says whether a rate is sensible.
 */
export function spendPlan(txns: BankTxn[], accounts: BankAccount[], days: number): SpendPlan[] {
  if (days <= 0) return [];
  const per = new Map<string, { spent: number; received: number }>();
  for (const t of txns) {
    if (t.pending) continue; // pending is not yet money
    const code = (t.currency || "").toUpperCase() || "—";
    const slot = per.get(code) ?? { spent: 0, received: 0 };
    if (isSpend(t)) slot.spent += t.amount;
    else slot.received += Math.abs(t.amount);
    per.set(code, slot);
  }
  const balances = new Map(totalsByCurrency(accounts).map((t) => [t.currency, t.current]));
  return [...per.entries()]
    .map(([currency, v]) => {
      const perDay = v.spent / days;
      const balance = balances.has(currency) ? (balances.get(currency) as number) : null;
      const daysCovered = balance != null && perDay > 0 ? Math.floor(balance / perDay) : null;
      return { currency, days, spent: v.spent, received: v.received, perDay, balance, daysCovered };
    })
    .sort((a, b) => b.spent - a.spent);
}

/** The plan in plain words, with the window named so no number floats free. */
export function planWords(p: SpendPlan): string {
  const head = `${money(p.spent, p.currency)} out and ${money(p.received, p.currency)} in over the last ${p.days} days — ${money(p.perDay, p.currency)} a day.`;
  if (p.balance == null) return head;
  const cover =
    p.daysCovered == null
      ? " Nothing went out, so there is no rate to carry forward."
      : ` At that rate the ${money(p.balance, p.currency)} on hand covers about ${p.daysCovered} more ${p.daysCovered === 1 ? "day" : "days"}.`;
  return head + cover;
}

/** What Echo says when money is asked about and no bank is linked. */
export const NO_BANK =
  "No bank is linked, so there is nothing here to read. Linking one is done in Schedule, under Money.";
