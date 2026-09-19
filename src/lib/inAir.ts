// inAir — what is true while you are on the aircraft, worked out from the filed
// times and the two airports' own coordinates.
//
// Doctrine:
//   - No radar fix is invented. When the airline has filed no position, the
//     progress here is the clock's, and it says so in the source field.
//   - Distance is the great circle between the two airports on record. An
//     airport Echo does not keep has no distance, and that returns null.
//   - Cabin power and connectivity are usual practice on long-haul aircraft, not
//     a reading off this aircraft. The wording never claims otherwise.
import { airportPoint, distanceKm } from "./airports";

const KM_TO_MI = 0.621371;

export type InAirRead = {
  /** 0..1 along the track, from the clock. Null when either end has no time. */
  progress: number | null;
  /** Whole great-circle distance in miles. Null when either airport is unknown. */
  totalMi: number | null;
  /** Miles still to fly, on the clock's progress. Null without both of the above. */
  toGoMi: number | null;
  flownMi: number | null;
  /** Minutes until the filed landing. Negative is clamped to zero. */
  minsLeft: number | null;
  /** "6h 20m left" / null. */
  leftWords: string | null;
  /** Where the progress came from, said out loud. */
  source: "clock" | "none";
};

function words(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The in-air read for one leg. Both instants must already be anchored to their
 * own airport's zone by the caller — this does arithmetic, not zone repair.
 */
export function inAirRead({
  fromIata,
  toIata,
  departAt,
  arriveAt,
  now = new Date(),
}: {
  fromIata: string | null | undefined;
  toIata: string | null | undefined;
  departAt: string | null | undefined;
  arriveAt: string | null | undefined;
  now?: Date;
}): InAirRead {
  const a = airportPoint(fromIata);
  const b = airportPoint(toIata);
  const totalMi = a && b ? Math.round(distanceKm(a, b) * KM_TO_MI) : null;

  const dep = departAt ? Date.parse(departAt) : NaN;
  const arr = arriveAt ? Date.parse(arriveAt) : NaN;
  const nowMs = now.getTime();

  let progress: number | null = null;
  if (Number.isFinite(dep) && Number.isFinite(arr) && arr > dep) {
    progress = Math.min(1, Math.max(0, (nowMs - dep) / (arr - dep)));
  }

  const minsLeft = Number.isFinite(arr) ? Math.max(0, Math.round((arr - nowMs) / 60_000)) : null;
  const toGoMi = totalMi !== null && progress !== null ? Math.round(totalMi * (1 - progress)) : null;
  const flownMi = totalMi !== null && toGoMi !== null ? totalMi - toGoMi : null;

  return {
    progress,
    totalMi,
    toGoMi,
    flownMi,
    minsLeft,
    leftWords: minsLeft === null ? null : minsLeft === 0 ? "landing now" : `${words(minsLeft)} left`,
    source: progress === null ? "none" : "clock",
  };
}

/** The instant at a fraction of the flight, for scrubbing the track. */
export function instantAlong(
  departAt: string | null | undefined,
  arriveAt: string | null | undefined,
): (t: number) => string | null {
  const dep = departAt ? Date.parse(departAt) : NaN;
  const arr = arriveAt ? Date.parse(arriveAt) : NaN;
  return (t: number) => {
    if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return null;
    return new Date(dep + (arr - dep) * Math.min(1, Math.max(0, t))).toISOString();
  };
}

export type CabinRead = { power: string; wifi: string; caveat: string };

/**
 * Cabin power and connectivity. Echo keeps no aircraft register, so this is the
 * usual practice on a long-haul flight, labelled as such — never a claim about
 * the seat you are sitting in.
 */
export function cabinRead(totalMi: number | null): CabinRead {
  const longHaul = totalMi !== null && totalMi >= 2200;
  return longHaul
    ? {
        power: "USUALLY AT THE SEAT",
        wifi: "USUALLY PAID",
        caveat:
          "Usual practice on a long-haul aircraft, not a reading off this one. Echo keeps no aircraft register, so seat power and satellite Wi-Fi are what the crew tells you, not what this card says.",
      }
    : {
        power: "NOT ON RECORD",
        wifi: "NOT ON RECORD",
        caveat:
          "Echo keeps no aircraft register, so cabin power and Wi-Fi for this flight are not on record. The crew's word is the one that counts.",
      };
}

/** What Echo can and cannot do once the doors are shut. Said plainly. */
export const OFFLINE_LAW =
  "Off the network, this card keeps running on your device's clock and the times already on record. Nothing new is read from the airline until you are back on a signal.";
