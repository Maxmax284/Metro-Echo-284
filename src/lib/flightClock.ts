// flightClock — how a flight time is read out loud.
//
// Doctrine:
//   - 12-hour with AM/PM. "22:45" is not how a tired person reads a time.
//   - A time without its day is a trap: 10:15 PM tonight and 1:15 AM tomorrow
//     are three hours apart, and the card has to say so.
//   - The day word comes from the person's own zone, never the browser's.
import { formatInTimeZone } from "date-fns-tz";

function dayKey(at: Date, timezone: string): string {
  return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

/** "1:15 AM tomorrow", "10:15 PM tonight", "6:40 AM on Sep 24". */
export function flightTimeWords(iso: string | null | undefined, timezone: string, now: Date = new Date()): string {
  if (!iso) return "not on record";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "not on record";
  const tz = timezone || "UTC";
  const time = formatInTimeZone(d, tz, "h:mm a");
  const today = dayKey(now, tz);
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
