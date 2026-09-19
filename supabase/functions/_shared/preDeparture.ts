// preDeparture — the countdown errands before a flight, worked out from the
// one time that matters: departure.
//
// Doctrine:
//   - Derived, never stored. No checklist table, no taps to tick things off.
//   - The times here are the usual airline practice, said as such. Echo never
//     dresses a general rule up as this airline's filed cutoff.
//   - It shows while there is still something to do with the information, and
//     steps out of the way once the boarding window takes over the card.
//   - Times read the way the ticket prints them: wall clock at the origin
//     airport, 12-hour, with the day when it is not today.
//   - One module, two runtimes. The screen and the Telegram reminder read the
//     same errands from the same rules; only the time wording is injected.
//
// Pure module: no IO, no React.

import { airport, bordersCrossed } from "./airports.ts";

/** Minutes before departure when check-in and bag drop usually close. */
export const CHECK_IN_CLOSE_INTERNATIONAL_MIN = 60;
export const CHECK_IN_CLOSE_DOMESTIC_MIN = 45;
/** Minutes before departure when a person should be at the gate. */
export const BE_AT_GATE_MIN = 40;
/** The pack earns its place this far out, and no further. */
export const PACK_HORIZON_MIN = 36 * 60;
/** Inside this window the pack is worth saying out loud, not just showing. */
export const REMINDER_WINDOW_MIN = 5 * 60;

export type PackItem = {
  key: "check_in" | "bag_drop" | "security" | "boarding_pass" | "at_gate";
  label: string;
  words: string;
};

export type PreDeparturePack = {
  show: boolean;
  international: boolean;
  items: PackItem[];
  /** The one honesty line, always present when the pack shows. */
  note: string;
};

/** How a flight time is said. Injected so both runtimes read one set of rules. */
export type TimeWords = (iso: string, timezone: string, now?: Date) => string;

const HAS_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/** A ticket time shifted by minutes, keeping its naive-or-zoned shape. */
function shiftMinutes(at: string, mins: number): string | null {
  if (HAS_ZONE.test(at)) {
    const d = new Date(at);
    if (!Number.isFinite(d.getTime())) return null;
    return new Date(d.getTime() + mins * 60_000).toISOString();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(at);
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) +
      mins * 60_000,
  );
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Minutes from now until departure, or null when the time cannot be read. */
export function minutesToDeparture(at: string, fromIata: string | null, now: Date = new Date()): number | null {
  if (HAS_ZONE.test(at)) {
    const d = new Date(at);
    return Number.isFinite(d.getTime()) ? Math.round((d.getTime() - now.getTime()) / 60_000) : null;
  }
  /* A naive ticket time is the wall clock at the origin airport: compare it
     against what the clock says there right now, not against the device. */
  const tz = airport(fromIata)?.tz;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(at);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!tz) return null;
  const nowWallStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const w = /^(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2})$/.exec(nowWallStr);
  if (!w) return null;
  const nowWall = Date.UTC(
    Number(w[1]),
    Number(w[2]) - 1,
    Number(w[3]),
    Number(w[4]) === 24 ? 0 : Number(w[4]),
    Number(w[5]),
  );
  return Math.round((wall - nowWall) / 60_000);
}

/** 12-hour wording with no dependency on a date library, for the edge runtime. */
export const plainTimeWords: TimeWords = (iso, timezone, now = new Date()) => {
  if (!iso) return "not on record";
  const tz = timezone || "UTC";
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(d);

  const say = (hour: number, minute: number) => {
    const ap = hour >= 12 ? "PM" : "AM";
    const hh = hour % 12 === 0 ? 12 : hour % 12;
    return `${hh}:${String(minute).padStart(2, "0")} ${ap}`;
  };
  const dayKey = (d: Date) =>
    fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/^(\d+)\/(\d+)\/(\d+)$/, "$3-$1-$2");
  const today = dayKey(now);

  if (!HAS_ZONE.test(iso)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
    if (!m) return "not on record";
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    const time = say(Number(m[4]), Number(m[5]));
    const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (diff === 0) return Number(m[4]) >= 18 ? `${time} tonight` : `${time} today`;
    if (diff === 1) return `${time} tomorrow`;
    if (diff === -1) return `${time} yesterday`;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return `${time} on ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d)}`;
  }

  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "not on record";
  const time = fmt(d, { hour: "numeric", minute: "2-digit" }).replace(/\u202f/g, " ");
  const key = dayKey(d);
  const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return Number(fmt(d, { hour: "2-digit", hour12: false })) >= 18 ? `${time} tonight` : `${time} today`;
  if (diff === 1) return `${time} tomorrow`;
  if (diff === -1) return `${time} yesterday`;
  return `${time} on ${fmt(d, { month: "short", day: "numeric" })}`;
};

export type PreDepartureInput = {
  departAt: string | null;
  fromIata: string | null;
  toIata: string | null;
  now?: Date;
  /** How times are said. Defaults to the plain 12-hour wording. */
  words?: TimeWords;
};

/**
 * The errands between now and wheels-up, each with its time. Empty when there
 * is no departure time, when boarding has already taken over, or when the
 * flight is beyond the horizon where a reminder is just noise.
 */
export function preDeparturePack(input: PreDepartureInput): PreDeparturePack {
  const empty: PreDeparturePack = {
    show: false,
    international: bordersCrossed(input.fromIata, input.toIata) === "different",
    items: [],
    note: "",
  };
  const at = (input.departAt ?? "").trim();
  if (!at) return empty;
  const now = input.now ?? new Date();
  const mins = minutesToDeparture(at, input.fromIata, now);
  if (mins == null || mins <= BE_AT_GATE_MIN || mins > PACK_HORIZON_MIN) return empty;

  const words = input.words ?? plainTimeWords;
  const international = empty.international;
  const closeMin = international ? CHECK_IN_CLOSE_INTERNATIONAL_MIN : CHECK_IN_CLOSE_DOMESTIC_MIN;
  const zone = airport(input.fromIata)?.tz ?? "UTC";
  const close = shiftMinutes(at, -closeMin);
  const gate = shiftMinutes(at, -BE_AT_GATE_MIN);
  if (!close || !gate) return empty;
  const closeWords = words(close, zone, now);
  const gateWords = words(gate, zone, now);
  const place = airport(input.fromIata)?.name ?? null;

  return {
    show: true,
    international,
    items: [
      {
        key: "check_in",
        label: "Check-in closes",
        words: international
          ? `Usually an hour before an international flight — around ${closeWords}.`
          : `Usually about 45 minutes before a home flight — around ${closeWords}.`,
      },
      {
        key: "bag_drop",
        label: "Bags drop closes",
        words: `With check-in, around ${closeWords}. After that the bag goes nowhere.`,
      },
      {
        key: "security",
        label: "Security",
        words: place
          ? `Between bag drop and your gate at ${place}. No honest wait time is on record — earlier is the whole trick.`
          : "Between bag drop and your gate. No honest wait time is on record — earlier is the whole trick.",
      },
      {
        key: "boarding_pass",
        label: "Boarding pass",
        words: "On your phone or printed before security. The desk can reprint one; the queue will not wait for it.",
      },
      {
        key: "at_gate",
        label: "At the gate by",
        words: `${gateWords} — doors usually close well before the filed departure.`,
      },
    ],
    note: "These cutoffs are the usual airline practice, not this airline's filed rule — your booking holds the exact one.",
  };
}

/**
 * The same pack, said once in a message. Null when there is nothing worth
 * saying yet: too far out, already boarding, or no time on record. This is a
 * notification — it acknowledges nothing and executes nothing.
 */
export function preDepartureNotice(input: {
  pack: PreDeparturePack;
  minsToDeparture: number | null;
  flightWords: string | null;
  fromIata: string | null;
}): { title: string; body: string } | null {
  const { pack, minsToDeparture: mins } = input;
  if (!pack.show) return null;
  if (mins == null || mins > REMINDER_WINDOW_MIN) return null;
  const place = airport(input.fromIata)?.name ?? input.fromIata ?? "the airport";
  const flight = (input.flightWords ?? "").trim();
  const lines = [
    flight ? `${flight} out of ${place}.` : `Your flight out of ${place}.`,
    ...pack.items.map((i) => `${i.label}: ${i.words}`),
    pack.note,
  ];
  return { title: "Before you leave", body: lines.join("\n") };
}
