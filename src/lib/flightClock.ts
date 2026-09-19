// flightClock — how a flight time is read out loud.
//
// Doctrine:
//   - 12-hour with AM/PM. "22:45" is not how a tired person reads a time.
//   - A time without its day is a trap: 10:15 PM tonight and 1:15 AM tomorrow
//     are three hours apart, and the card has to say so.
//   - The day word comes from the person's own zone, never the browser's.
import { airportZone } from "@/lib/travelSense";
import { formatInTimeZone } from "date-fns-tz";

function dayKey(at: Date, timezone: string): string {
  return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

const HAS_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function twelve(h: number, m: number): string {
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

function dayWord(key: string, today: string, hour: number, monthDay: string): string | null {
  if (key === today) return hour >= 18 ? "tonight" : "today";
  const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return `on ${monthDay}`;
}

/** "1:15 AM tomorrow", "10:15 PM tonight", "6:40 AM on Sep 24". */
export function flightTimeWords(iso: string | null | undefined, timezone: string, now: Date = new Date()): string {
  if (!iso) return "not on record";
  const tz = timezone || "UTC";
  const today = dayKey(now, tz);

  /* A ticket time carries no zone: it is the wall clock at the airport. Echo
     shows it exactly as the ticket says, never shifted into another zone. */
  if (!HAS_ZONE.test(iso)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
    if (m) {
      const key = `${m[1]}-${m[2]}-${m[3]}`;
      const hour = Number(m[4]);
      const word = dayWord(key, today, hour, `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`);
      return `${twelve(hour, Number(m[5]))}${word ? ` ${word}` : ""}`;
    }
  }

  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "not on record";
  const time = formatInTimeZone(d, tz, "h:mm a");
  const key = dayKey(d, tz);
  if (key === today) {
    const hour = Number(formatInTimeZone(d, tz, "H"));
    return hour >= 18 ? `${time} tonight` : `${time} today`;
  }
  const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return `${time} tomorrow`;
  if (diff === -1) return `${time} yesterday`;
  return `${time} on ${formatInTimeZone(d, tz, "MMM d")}`;
}

/** A clock function for the flight surfaces: 12-hour, with the day when it differs. */
export function flightClock(timezone: string): (iso: string) => string {
  return (iso: string) => flightTimeWords(iso, timezone);
}

/**
 * The same clock, but told which end of the leg it is reading. A departure is
 * said on the departure airport's wall clock and a landing on the arrival
 * airport's, the way a ticket prints them; the traveller's own zone is only the
 * fallback for an airport Echo holds no zone for.
 */
export function airportEndClock(timezone: string): (iso: string, iata?: string | null) => string {
  return (iso: string, iata?: string | null) => flightTimeWords(iso, airportZone(iata) ?? timezone);
}
