// friction — the arithmetic of inconvenience.
//
// Doctrine:
//   - Money is not the only cost. Time, transfers, walking, and a closing door
//     are costs too, and Echo counts them.
//   - The tradeoff is always shown. A recommendation is a judgement and gets
//     labelled as one, never dressed up as a fact.
//   - Nothing is compared on a field that was not given. Two options where one
//     has no price get no cheapest.
//
// Pure module: no IO, no React.

import { formatMoney } from "./currency.ts";

export const FRICTION_LAW =
  "Cheapest, fastest and least hassle are three different answers. The pick is a judgement on the numbers given, not a fact.";

export type Option = {
  label: string;
  /** Total cost in `currency`. Null or undefined when unknown. */
  money?: number | null;
  currency?: string | null;
  /** Door to door, in minutes. */
  minutes?: number | null;
  transfers?: number | null;
  walkMinutes?: number | null;
  /** Anything the person should weigh that is not a number. */
  note?: string | null;
};

/**
 * Hassle in minutes-equivalent: a transfer costs about eight minutes of
 * patience beyond the clock, and walking counts one and a half times.
 * Deliberately crude, and stated as crude wherever it is used.
 */
export function hassleScore(o: Option): number | null {
  const transfers = num(o.transfers);
  const walk = num(o.walkMinutes);
  const minutes = num(o.minutes);
  if (transfers == null && walk == null && minutes == null) return null;
  return (minutes ?? 0) + (transfers ?? 0) * 8 + (walk ?? 0) * 0.5;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function best<T>(rows: T[], value: (r: T) => number | null): T | null {
  let out: T | null = null;
  let bestVal = Infinity;
  for (const r of rows) {
    const v = value(r);
    if (v == null) continue;
    if (v < bestVal) { bestVal = v; out = r; }
  }
  return out;
}

export type Comparison = {
  cheapest: Option | null;
  fastest: Option | null;
  leastHassle: Option | null;
  /** Fields that could not be compared because they were missing somewhere. */
  missing: string[];
  /** The judgement, or null when the numbers do not support one. */
  pick: { label: string; because: string } | null;
};

export function compareOptions(options: Option[]): Comparison {
  const rows = options.filter((o) => o && typeof o.label === "string" && o.label.trim());
  const missing: string[] = [];
  const priced = rows.filter((o) => num(o.money) != null);
  const timed = rows.filter((o) => num(o.minutes) != null);
  if (priced.length !== rows.length) missing.push("price");
  if (timed.length !== rows.length) missing.push("time");

  const cheapest = priced.length >= 2 ? best(priced, (o) => num(o.money)) : null;
  const fastest = timed.length >= 2 ? best(timed, (o) => num(o.minutes)) : null;
  const scored = rows.filter((o) => hassleScore(o) != null);
  const leastHassle = scored.length >= 2 ? best(scored, hassleScore) : null;

  let pick: Comparison["pick"] = null;
  if (rows.length >= 2 && cheapest && fastest) {
    if (cheapest.label === fastest.label) {
      pick = { label: cheapest.label, because: "it is both the cheapest and the fastest here" };
    } else {
      const saved = (num(cheapest.money) ?? 0);
      const other = (num(fastest.money) ?? 0);
      const money = other - saved;
      const timeLost = (num(cheapest.minutes) ?? 0) - (num(fastest.minutes) ?? 0);
      // A cheap option that costs more than about a minute per unit of money is
      // usually the worse move on a normal day. Stated as a judgement.
      pick = timeLost > 30 && money < 15
        ? { label: fastest.label, because: `the cheaper one saves ${formatGap(money, cheapest.currency ?? fastest.currency)} and costs ${timeLost} extra minutes` }
        : { label: cheapest.label, because: `the time it costs you is small next to ${formatGap(money, cheapest.currency ?? fastest.currency)}` };
    }
  }

  return { cheapest, fastest, leastHassle, missing, pick };
}

function formatGap(amount: number, currency?: string | null): string {
  const code = (currency ?? "").toUpperCase();
  if (!code || code.length !== 3) return `${Math.round(amount * 100) / 100}`;
  return formatMoney(Math.abs(amount), code);
}

function line(o: Option): string {
  const bits: string[] = [o.label];
  const money = num(o.money);
  if (money != null) bits.push(formatGap(money, o.currency));
  const minutes = num(o.minutes);
  if (minutes != null) bits.push(`${minutes} min`);
  const transfers = num(o.transfers);
  if (transfers != null) bits.push(transfers === 0 ? "no transfers" : `${transfers} transfer${transfers === 1 ? "" : "s"}`);
  const walk = num(o.walkMinutes);
  if (walk != null && walk > 0) bits.push(`${walk} min walk`);
  if (o.note) bits.push(o.note);
  return bits.join(", ");
}

/** One answer: every option in a line, then the tradeoff, then the judgement. */
export function frictionAnswer(options: Option[]): string {
  const rows = (options ?? []).filter((o) => o && typeof o.label === "string" && o.label.trim());
  if (rows.length === 0) return "There are no options written down to compare, so Echo will not rank anything.";
  if (rows.length === 1) {
    return `Only one option was given — ${line(rows[0])}. Echo will not call a single option the best one.`;
  }

  const c = compareOptions(rows);
  const parts: string[] = [rows.map(line).join(" | ")];

  if (c.cheapest) parts.push(`Cheapest: ${c.cheapest.label}.`);
  if (c.fastest) parts.push(`Fastest: ${c.fastest.label}.`);
  if (c.leastHassle) parts.push(`Least hassle: ${c.leastHassle.label}.`);
  if (c.missing.length) {
    parts.push(`No ${c.missing.join(" or ")} was given for every option, so Echo is not ranking on that.`);
  }
  if (c.pick) parts.push(`Practical move: ${c.pick.label} — ${c.pick.because}.`);
  parts.push(FRICTION_LAW);
  return parts.join(" ");
}
