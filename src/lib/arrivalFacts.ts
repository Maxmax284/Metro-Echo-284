// arrivalFacts — what is true about the ground you just landed on.
//
// Doctrine:
//   - Kept tables only. An airport, a currency or an emergency number that is
//     not on record is reported as not on record, never guessed.
//   - No rate is invented here. The money line names the currency, not a price.
//   - The clock is read in the arrival airport's own zone, never shifted by the
//     browser, and the difference from home is stated rather than applied.
import { airport } from "@/lib/airports";
import { currencyForCountry, CURRENCY_SYMBOL } from "@/lib/currency";
import { helpFor, type HelpNumbers } from "@/lib/localHelp";

export type ArrivalFacts = {
  iata: string;
  /** Airport name when kept, else null. */
  name: string | null;
  city: string | null;
  country: string | null;
  cc: string | null;
  tz: string | null;
  /** Local wall clock at the arrival airport, e.g. "5:10 AM". */
  localTime: string | null;
  /** Local date at the arrival airport, e.g. "2026.09.20". */
  localDate: string | null;
  /** Whole-hour difference from the home zone at that instant, or null. */
  shiftHours: number | null;
  currency: string | null;
  currencySymbol: string | null;
  help: HelpNumbers | null;
};

function parts(iso: string, tz: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** Minutes a zone sits from UTC at a given instant, read from the zone itself. */
function offsetMinutes(iso: string, tz: string): number | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
  const m = s.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!m) return null;
  const asUtc = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4] % 24, +m[5], +m[6]);
  return Math.round((asUtc - d.getTime()) / 60000);
}

/**
 * Everything Echo can honestly say about an arrival airport at an instant.
 * `at` may be null — then only the place facts are filled, and the clock lines
 * stay null rather than showing "now" as if it were the landing minute.
 */
export function arrivalFacts(
  iata: string | null | undefined,
  at: string | null | undefined,
  homeZone?: string | null,
): ArrivalFacts | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (!code) return null;
  const a = airport(code);
  const currency = a ? currencyForCountry(a.cc) : null;

  let localTime: string | null = null;
  let localDate: string | null = null;
  let shiftHours: number | null = null;

  const iso = (at ?? "").trim();
  const valid = iso && Number.isFinite(Date.parse(iso));
  if (a && valid) {
    const p = parts(iso, a.tz);
    if (p.hour && p.minute) localTime = `${p.hour}:${p.minute} ${p.dayPeriod ?? ""}`.trim();
    if (p.year) localDate = `${p.year}.${p.month}.${p.day}`;
    if (homeZone) {
      const there = offsetMinutes(iso, a.tz);
      const home = offsetMinutes(iso, homeZone);
      if (there !== null && home !== null) shiftHours = Math.round((there - home) / 60);
    }
  }

  return {
    iata: code,
    name: a?.name ?? null,
    city: a?.city ?? null,
    country: a?.country ?? null,
    cc: a?.cc ?? null,
    tz: a?.tz ?? null,
    localTime,
    localDate,
    shiftHours,
    currency,
    currencySymbol: currency ? (CURRENCY_SYMBOL[currency] ?? null) : null,
    help: a ? helpFor(a.cc) : null,
  };
}

/** The one sentence about the clock, or null when there is nothing true to say. */
export function shiftWords(f: ArrivalFacts): string | null {
  if (f.shiftHours === null || !f.city) return null;
  if (f.shiftHours === 0) return `${f.city} keeps the same clock as home.`;
  const h = Math.abs(f.shiftHours);
  const dir = f.shiftHours > 0 ? "ahead of" : "behind";
  return `${f.city} runs ${h} ${h === 1 ? "hour" : "hours"} ${dir} your home clock.`;
}

/** The emergency line as one short string, or null when not on record. */
export function helpCells(f: ArrivalFacts): string | null {
  const row = f.help;
  if (!row) return null;
  if (row.general) return row.general;
  const parts = [row.police, row.ambulance, row.fire].filter(Boolean) as string[];
  const uniq = [...new Set(parts)];
  return uniq.length ? uniq.join(" · ") : null;
}
