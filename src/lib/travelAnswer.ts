// travelAnswer — one honest sentence about getting somewhere on time.
//
// Doctrine:
//   - Recorded ground truth only. No drive time, no sentence about one.
//   - Words, never bare numbers, and never a countdown: it says how long the
//     road takes and when to leave, once.
//   - Missing pieces are said plainly — an address the map could not find, a
//     place Echo does not know you are standing in.
import { formatInTimeZone } from "date-fns-tz";

export type TravelSubject = {
  title: string | null;
  starts_at: string;
  location: string | null;
};

export type TravelRead = {
  /** Driving seconds from the fix Echo is using, or null when unroutable. */
  durationS: number | null;
  distanceM: number | null;
};

/** "22 minutes" / "2 hours 5 minutes". */
export function durationWords(durationS: number | null | undefined): string | null {
  const s = Number(durationS);
  if (!Number.isFinite(s) || s <= 0) return null;
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return m ? `${hours} ${m} minute${m === 1 ? "" : "s"}` : hours;
}

/** Miles for a US-style read, kilometres elsewhere. Distance stays optional. */
export function distanceWords(distanceM: number | null | undefined): string | null {
  const m = Number(distanceM);
  if (!Number.isFinite(m) || m <= 0) return null;
  const km = m / 1000;
  return km < 1 ? "under a kilometre" : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/**
 * The whole answer for one appointment. `nowMs` decides whether leaving is
 * already overdue; the sentence never pretends there is room that is gone.
 */
export function travelAnswer(
  subject: TravelSubject,
  read: TravelRead,
  timezone: string,
  nowMs: number,
): string {
  const label = (subject.title ?? "").trim() || "that appointment";
  const startMs = new Date(subject.starts_at).getTime();
  const at = Number.isFinite(startMs) ? formatInTimeZone(startMs, timezone || "UTC", "h:mm a") : null;

  if (!subject.location?.trim()) {
    return `${label}${at ? ` is at ${at}` : ""}, but there is no address on it — add a place to the entry and I can work out the drive.`;
  }

  const drive = durationWords(read.durationS);
  if (!drive) {
    return `I could not get a road route to ${subject.location.trim()}, so I am not going to guess a drive time.`;
  }

  const far = distanceWords(read.distanceM);
  const head = `About ${drive}${far ? ` (${far})` : ""} to ${label}${at ? ` at ${at}` : ""}.`;

  if (!Number.isFinite(startMs)) return head;

  const leaveMs = startMs - Number(read.durationS) * 1000;
  const leaveAt = formatInTimeZone(leaveMs, timezone || "UTC", "h:mm a");
  if (leaveMs <= nowMs) {
    return `${head} On that road you would already be leaving now.`;
  }
  return `${head} Leave by ${leaveAt} to be there on time.`;
}
