// friction — technically possible is not the same as practically smart.
//
// Doctrine:
//   - Compare only what is actually known. A missing price is not a free option.
//   - Currencies never mix. Two currencies means the money comparison is off.
//   - Cheapest / fastest / least hassle is a useful shape, not a template to
//     force on every answer. When there is nothing to compare, say so.
//   - Subjective judgement is never stated as fact. Echo shows the tradeoff and
//     lets the person pick.
//
// Pure module.

export type FrictionOption = {
  label: string;
  /** Smallest currency unit, so no float drift. Unknown stays null. */
  costMinor?: number | null;
  /** ISO 4217. Required whenever costMinor is set. */
  currency?: string | null;
  minutes?: number | null;
  transfers?: number | null;
  distanceKm?: number | null;
  /** ISO time this option stops being available. */
  closesAt?: string | null;
  /** A recorded constraint of the person's own. */
  note?: string | null;
};

export type Tradeoff = {
  cheapest: string | null;
  fastest: string | null;
  leastHassle: string | null;
  /** What could not be compared, in plain words. */
  unknown: string[];
  /** True when at least one axis had two real values to compare. */
  comparable: boolean;
  /** The sentence a person can act on. Shows the tradeoff, never the verdict. */
  sentence: string;
};

const money = (minor: number, currency: string): string => {
  const major = minor / 100;
  const shown = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${shown} ${currency.toUpperCase()}`;
};

const minutesWords = (m: number): string => {
  if (m < 60) return `${Math.round(m)} min`;
  const hours = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

/** Hassle is steps, distance and the risk of arriving after the door shuts. */
function hassleScore(option: FrictionOption, now: Date): number | null {
  let score = 0;
  let known = false;
  if (typeof option.transfers === "number") {
    score += option.transfers * 2;
    known = true;
  }
  if (typeof option.distanceKm === "number") {
    score += option.distanceKm / 5;
    known = true;
  }
  if (option.closesAt && typeof option.minutes === "number") {
    const closes = Date.parse(option.closesAt);
    if (Number.isFinite(closes)) {
      const spare = (closes - now.getTime()) / 60000 - option.minutes;
      if (spare < 0) score += 10;
      else if (spare < 20) score += 4;
      known = true;
    }
  }
  return known ? score : null;
}

function pickLowest<T>(rows: T[], value: (row: T) => number | null): T | null {
  const scored = rows
    .map((row) => ({ row, n: value(row) }))
    .filter((r): r is { row: T; n: number } => r.n != null && Number.isFinite(r.n));
  if (scored.length < 2) return scored.length === 1 ? scored[0].row : null;
  scored.sort((a, b) => a.n - b.n);
  // A tie is not a winner.
  return scored[0].n === scored[1].n ? null : scored[0].row;
}

/**
 * Compare options across whatever axes actually have numbers on them.
 * Never invents a value, never fills a gap, never ranks on a single option.
 */
export function compareOptions(options: FrictionOption[], now = new Date()): Tradeoff {
  const unknown: string[] = [];
  if (options.length < 2) {
    return {
      cheapest: null,
      fastest: null,
      leastHassle: null,
      unknown: options.length ? ["only one option is on the table, so there is nothing to weigh"] : ["no options recorded"],
      comparable: false,
      sentence: options.length
        ? `Only ${options[0].label} is on the table, so there is nothing to weigh against it.`
        : "Nothing to compare yet.",
    };
  }

  const priced = options.filter((o) => typeof o.costMinor === "number" && o.currency);
  const currencies = new Set(priced.map((o) => (o.currency ?? "").toUpperCase()));
  let cheapest: FrictionOption | null = null;
  if (currencies.size > 1) {
    unknown.push("prices are in different currencies, so cheapest is not a straight comparison");
  } else if (priced.length < 2) {
    unknown.push("not every option has a price");
    if (priced.length === 1) unknown.push(`only ${priced[0].label} has a price on it`);
  } else {
    cheapest = pickLowest(priced, (o) => o.costMinor ?? null);
  }

  const timed = options.filter((o) => typeof o.minutes === "number");
  if (timed.length < 2) unknown.push("not every option has a travel time");
  const fastest = pickLowest(timed, (o) => o.minutes ?? null);

  const hassled = options.filter((o) => hassleScore(o, now) != null);
  if (hassled.length < 2) unknown.push("not enough is known about steps, distance or closing times");
  const leastHassle = pickLowest(hassled, (o) => hassleScore(o, now));

  const comparable = !!(cheapest || fastest || leastHassle);
  const parts: string[] = [];
  if (cheapest && cheapest.currency && typeof cheapest.costMinor === "number") {
    parts.push(`Cheapest is ${cheapest.label} at ${money(cheapest.costMinor, cheapest.currency)}`);
  }
  if (fastest && typeof fastest.minutes === "number") {
    parts.push(`fastest is ${fastest.label} at ${minutesWords(fastest.minutes)}`);
  }
  if (leastHassle && leastHassle !== fastest && leastHassle !== cheapest) {
    parts.push(`least hassle is ${leastHassle.label}`);
  }

  let sentence: string;
  if (!comparable) {
    sentence = `Not enough is known to weigh these: ${unknown.join("; ")}.`;
  } else {
    sentence = parts.join(", ") + ".";
    const gap = tradeoffClause(cheapest, fastest, now);
    if (gap) sentence += ` ${gap}`;
    if (unknown.length) sentence += ` Not known: ${unknown.join("; ")}.`;
  }

  return {
    cheapest: cheapest?.label ?? null,
    fastest: fastest?.label ?? null,
    leastHassle: leastHassle?.label ?? null,
    unknown,
    comparable,
    sentence,
  };
}

/**
 * The sentence that makes it street smart: what the cheap option actually costs
 * you. Stated as a tradeoff for the person to settle, never as Echo's verdict.
 */
export function tradeoffClause(
  cheapest: FrictionOption | null,
  fastest: FrictionOption | null,
  _now = new Date(),
): string | null {
  if (!cheapest || !fastest || cheapest === fastest) return null;
  if (typeof cheapest.costMinor !== "number" || typeof fastest.costMinor !== "number") return null;
  if (!cheapest.currency || cheapest.currency !== fastest.currency) return null;
  if (typeof cheapest.minutes !== "number" || typeof fastest.minutes !== "number") return null;

  const saved = money(fastest.costMinor - cheapest.costMinor, cheapest.currency);
  const lost = minutesWords(cheapest.minutes - fastest.minutes);
  const transfers = typeof cheapest.transfers === "number" && cheapest.transfers > (fastest.transfers ?? 0)
    ? ` and ${cheapest.transfers} ${cheapest.transfers === 1 ? "transfer" : "transfers"}`
    : "";
  return `${cheapest.label} saves ${saved} but adds ${lost}${transfers} — ${fastest.label} is the practical move if the time matters more than the ${saved}.`;
}

/** Recorded fact for a prompt. */
export function frictionBlock(t: Tradeoff): string {
  if (!t.comparable) return `Tradeoff: nothing comparable. ${t.unknown.join("; ")}. Say that plainly instead of picking a winner.`;
  return [
    "Tradeoff (recorded fact — do not add options, prices or times of your own):",
    `- ${t.sentence}`,
    "State the tradeoff. Let the person pick. Never present your preference as fact.",
  ].join("\n");
}
