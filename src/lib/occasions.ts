// occasions — kept cultural moments, computed on-device, never fetched.
//
// Doctrine:
//   - Opt-in only. Nothing here speaks unless the person switched occasions
//     on, and then only at the boot, as a station stamp over the place drum.
//   - Dates come from three honest sources: fixed civil dates, simple
//     weekday rules (fourth Thursday), and astronomy computed in this module
//     (Gregorian computus is exact; the November full moon comes from
//     station.ts, the one source of moon math). Nothing calls a feed, so it
//     holds offline.
//   - Tone is part of the fact. A celebration may arrive in red ink; a
//     remembrance stays quiet grey. Echo never confetti-bombs a sombre day.
//   - No matching country is an honest nothing. Unknown places get no stamp.
//
// Pure module: no IO, no React.

import { moonPhase } from "./station";

export type OccasionTone = "celebration" | "observance" | "remembrance";

/** 1-based [month, day]. */
export type MonthDay = [number, number];

export type Occasion = {
  id: string;
  /** Spoken name — "Songkran". */
  name: string;
  /** One dry line of provenance for the settings list. */
  note: string;
  tone: OccasionTone;
  /** ISO 3166 alpha-2 country codes, uppercase. */
  countries: string[];
  /** The inclusive window the occasion holds, resolved for a calendar year. */
  window(year: number): { start: MonthDay; end: MonthDay };
};

/** Where the per-device opt-in lives (read synchronously at boot mount). */
export const OCCASIONS_KEY = "vanta.occasions.on";

// ---------------------------------------------------------------------------
// Date rules — each resolves to plain month/day numbers, so timezone never
// moves a kept day.
// ---------------------------------------------------------------------------

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function md(d: Date): MonthDay {
  return [d.getUTCMonth() + 1, d.getUTCDate()];
}

/** Gregorian Easter Sunday — the computus is exact arithmetic, not an estimate. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** The nth weekday of a month — weekday 0 = Sunday, n 1-based. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + delta + (n - 1) * 7);
}

/** The last weekday of a month (last Monday of May, and so on). */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utc(year, month + 1, 0); // day 0 of next month = last of this one
  const delta = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -delta);
}

/** The November full moon, to the day — the sky Loy Krathong is set by.
 *  The official date follows the twelfth Thai lunar month, which tracks this
 *  full moon; the kept window is the day either side, so a one-day calendar
 *  difference never makes Echo wrong. */
function novemberFullMoon(year: number): Date {
  const FULL_AGE = 29.53059 / 2;
  let best = utc(year, 11, 1);
  let bestDelta = Infinity;
  for (let day = 1; day <= 30; day++) {
    const d = utc(year, 11, day);
    const delta = Math.abs(moonPhase(d).ageDays - FULL_AGE);
    if (delta < bestDelta) {
      best = d;
      bestDelta = delta;
    }
  }
  return best;
}

function fixed(month: number, startDay: number, endDay = startDay) {
  return () => ({ start: [month, startDay] as MonthDay, end: [month, endDay] as MonthDay });
}

// ---------------------------------------------------------------------------
// The kept list — curated, four seed regions, each with its tone. A day that
// matches nothing is an ordinary day, and that is a correct answer.
// ---------------------------------------------------------------------------

export const OCCASIONS: Occasion[] = [
  {
    id: "songkran",
    name: "Songkran",
    note: "Thai new year — three days of water, family and blessing.",
    tone: "celebration",
    countries: ["TH"],
    window: fixed(4, 13, 15),
  },
  {
    id: "loy-krathong",
    name: "Loy Krathong",
    note: "Festival of lights, read off the November full moon — the window holds the day either side.",
    tone: "observance",
    countries: ["TH"],
    window: (year) => {
      const full = novemberFullMoon(year);
      return { start: md(addDays(full, -1)), end: md(addDays(full, 1)) };
    },
  },
  {
    id: "us-independence",
    name: "Independence Day",
    note: "Fourth of July.",
    tone: "celebration",
    countries: ["US"],
    window: fixed(7, 4),
  },
  {
    id: "thanksgiving",
    name: "Thanksgiving",
    note: "Fourth Thursday of November. Tables full, roads busy.",
    tone: "observance",
    countries: ["US"],
    window: (year) => {
      const d = nthWeekday(year, 11, 4, 4);
      return { start: md(d), end: md(d) };
    },
  },
  {
    id: "memorial-day",
    name: "Memorial Day",
    note: "Last Monday of May. A day of remembrance — the stamp stays quiet.",
    tone: "remembrance",
    countries: ["US"],
    window: (year) => {
      const d = lastWeekday(year, 5, 1);
      return { start: md(d), end: md(d) };
    },
  },
  {
    id: "setsubun",
    name: "Setsubun",
    note: "The day before spring — beans thrown to chase the old year out.",
    tone: "observance",
    countries: ["JP"],
    window: fixed(2, 3),
  },
  {
    id: "golden-week",
    name: "Golden Week",
    note: "A run of national holidays — the country is on the move.",
    tone: "celebration",
    countries: ["JP"],
    window: fixed(4, 29, 5 * 0 + 5) /* Apr 29 – May 5 */,
  },
  {
    id: "carnival",
    name: "Carnival",
    note: "The Monday and Tuesday before Lent — the road belongs to the mas bands.",
    tone: "celebration",
    countries: ["TT"],
    window: (year) => {
      const ash = addDays(easterSunday(year), -46);
      return { start: md(addDays(ash, -2)), end: md(addDays(ash, -1)) };
    },
  },
  {
    id: "tt-independence",
    name: "Independence Day",
    note: "August 31, 1962.",
    tone: "celebration",
    countries: ["TT"],
    window: fixed(8, 31),
  },
];

/** Full country names for the kept regions — anything unmapped is an honest no-match. */
const NAME_TO_CODE: Record<string, string> = {
  THAILAND: "TH",
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  JAPAN: "JP",
  "TRINIDAD AND TOBAGO": "TT",
};

/** An ISO code or a full country name to the code the kept list speaks, or null. */
export function countryCodeOf(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^[A-Z]{2}$/.test(s)) return s;
  return NAME_TO_CODE[s] ?? null;
}

function num([m, d]: MonthDay): number {
  return m * 100 + d;
}

/**
 * The occasion holding today in this country, or null. Null is the common,
 * correct answer: most days in most places have no kept stamp, and unknown
 * countries never get one guessed for them.
 */
export function occasionFor(at: Date, country: string | null | undefined): Occasion | null {
  const code = countryCodeOf(country);
  if (!code) return null;
  const year = at.getFullYear();
  const today = num([at.getMonth() + 1, at.getDate()]);
  for (const o of OCCASIONS) {
    if (!o.countries.includes(code)) continue;
    const w = o.window(year);
    if (today >= num(w.start) && today <= num(w.end)) return o;
  }
  return null;
}
