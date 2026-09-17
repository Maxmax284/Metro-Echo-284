// flightChat — reading a flight out of something a person typed in a chat box.
//
// Doctrine:
//   - Deterministic. No model call decides whether "TG601 friday" is a flight.
//   - A number with no day is a question, not a guess. Echo asks which day once
//     and files nothing until it is told.
//   - Filing a flight is capture: it puts a card on your record. Confirming that
//     flight onto the board still only happens inside the platform.
//   - Cancelling is allowed from either side, because a card on your record is
//     not an executed thing — it is a note that can be dropped.
//
// Pure module: no IO, no React.
import { readFlightNo } from "./flightQuick.ts";

export const CHAT_LAW =
  "A flight number and a day files a card. A number on its own gets one question about the day. Nothing here books, holds or checks anyone in.";

export type FlightAsk =
  | { kind: "file"; flight_no: string; depart_on: string; day_words: string }
  | { kind: "needs_day"; flight_no: string }
  | { kind: "cancel"; flight_no: string }
  | null;

/* A flight code as people type it in a sentence, with real word boundaries so
   "IT205" inside a sentence about IT does not become a flight on its own. */
const CODE_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b/g;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(today: string, n: number): string {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * The day a person named, or null when they named none. Never today by default:
 * a flight with no day stated is a question, not an assumption.
 */
export function readDay(raw: string, today: string): { on: string; words: string } | null {
  const t = ` ${raw.toLowerCase().replace(/[,]/g, " ")} `;

  const isoHit = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoHit) return { on: `${isoHit[1]}-${isoHit[2]}-${isoHit[3]}`, words: isoHit[0].trim() };

  if (/\btoday\b|\btonight\b/.test(t)) return { on: today, words: "today" };
  if (/\btomorrow\b|\btmrw\b|\btmr\b|\btmw\b/.test(t)) return { on: addDays(today, 1), words: "tomorrow" };

  /* "sep 20" and "20 sep", with the year only when they wrote one. A day already
     gone this year is read as next year — nobody files a flight for last March. */
  const named =
    t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s+(\d{4}))?/) ??
    t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b(?:\s+(\d{4}))?/);
  if (named) {
    const a = named[1];
    const b = named[2];
    const monthWord = MONTHS[a] ? a : MONTHS[b] ? b : null;
    const dayNum = Number(MONTHS[a] ? b : a);
    if (monthWord && dayNum >= 1 && dayNum <= 31) {
      const month = MONTHS[monthWord];
      const statedYear = named[3] ? Number(named[3]) : null;
      const thisYear = Number(today.slice(0, 4));
      let year = statedYear ?? thisYear;
      if (!statedYear && iso(year, month, dayNum) < today) year = thisYear + 1;
      return { on: iso(year, month, dayNum), words: `${monthWord} ${dayNum}` };
    }
  }

  /* Month/day as digits, read the way it is written on this side of the water. */
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const yRaw = slash[3] ? Number(slash[3]) : null;
      const thisYear = Number(today.slice(0, 4));
      let year = yRaw == null ? thisYear : yRaw < 100 ? 2000 + yRaw : yRaw;
      if (yRaw == null && iso(year, month, day) < today) year = thisYear + 1;
      return { on: iso(year, month, day), words: `${month}/${day}` };
    }
  }

  /* A weekday means the next one coming, today included when they said it today. */
  const weekday = t.match(/\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/);
  if (weekday) {
    const want = WEEKDAYS[weekday[1]];
    const base = new Date(`${today}T00:00:00Z`).getUTCDay();
    const ahead = (want - base + 7) % 7;
    return { on: addDays(today, ahead), words: weekday[1] };
  }

  return null;
}

const CANCEL_RE = /\b(cancel|drop|scratch|forget|remove|delete)\b/;
const FLIGHT_WORD = /\bflight\b|\bflights\b|\bflying\b|\bfly\b|\bboard(?:ing)?\b/;

/** Every flight code in a line, longest-normalised, in the order written. */
function codesIn(raw: string): string[] {
  const found: string[] = [];
  const upper = raw.toUpperCase();
  for (const m of upper.matchAll(CODE_RE)) {
    const code = readFlightNo(`${m[1]}${m[2]}`);
    if (code && !found.includes(code)) found.push(code);
  }
  return found;
}

/**
 * What a typed line is asking of the flight desk, or null when it is asking
 * nothing. A bare code in a long sentence is deliberately ignored: the word
 * "flight" or a short line is what makes it an instruction rather than noise.
 */
export function readFlightAsk(raw: string, today: string): FlightAsk {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const codes = codesIn(text);
  if (!codes.length) return null;
  const flight_no = codes[0];

  const said = text.toLowerCase();
  const short = text.length <= 44;
  if (!FLIGHT_WORD.test(said) && !short) return null;

  if (CANCEL_RE.test(said)) return { kind: "cancel", flight_no };

  const day = readDay(text, today);
  if (!day) return { kind: "needs_day", flight_no };
  return { kind: "file", flight_no, depart_on: day.on, day_words: day.words };
}

/** The one question a bare number earns. */
export function askForDayWords(flight_no: string): string {
  return `${flight_no} — which day does it leave? Say a date, or "tomorrow", or the weekday. I won't pick one for you.`;
}

/** The question asked before a card is taken off the record. */
export function dropConfirmWords(flight_no: string, hit: { depart_on: string; status: string }): string {
  return hit.status === "confirmed"
    ? `Remove ${flight_no} on ${hit.depart_on} from your record? It's confirmed, so the departure and landing entries it wrote stay on your board until you clear those. Nothing is cancelled with the airline either way.`
    : `Remove ${flight_no} on ${hit.depart_on} from your record? It's still a draft, so nothing was booked and nothing gets cancelled with the airline.`;
}

/** The words left behind once a card is off the record. */
export function droppedWords(flight_no: string, hit: { depart_on: string; status: string }): string {
  return hit.status === "confirmed"
    ? `${flight_no} on ${hit.depart_on} is off your record. The board entries it wrote are still there — clear those in Metro Echo.`
    : `${flight_no} on ${hit.depart_on} is off your record. Nothing was booked, so nothing was cancelled with the airline.`;
}
