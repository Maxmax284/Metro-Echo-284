// cabinEstimate — the landing time on the screen in front of you.
//
// Doctrine:
//   - The airline files a schedule. The flight computer knows the wind. When the
//     two disagree, the seat-back screen is closer to the truth, and only the
//     traveller can read it. So Echo asks, it never guesses.
//   - It lives on this device: it is a reading taken in a cabin with no signal,
//     not a fact the airline published. No table, no receipt.
//   - It never replaces the filed time. Both are shown, each named.

const KEY = "vanta.cabin.landing";

export type CabinEstimate = {
  /** Full instant, already anchored to the arrival airport's zone. */
  at: string;
  /** When the traveller read it off the screen. */
  read_at: string;
};

export const CABIN_SOURCE = "the screen in front of you";

export function readCabinEstimate(planId: string): CabinEstimate | null {
  try {
    const raw = localStorage.getItem(`${KEY}.${planId}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as CabinEstimate;
    return v && typeof v.at === "string" && Number.isFinite(Date.parse(v.at)) ? v : null;
  } catch {
    return null;
  }
}

export function writeCabinEstimate(planId: string, at: string | null) {
  try {
    if (!at) localStorage.removeItem(`${KEY}.${planId}`);
    else localStorage.setItem(`${KEY}.${planId}`, JSON.stringify({ at, read_at: new Date().toISOString() }));
  } catch {
    /* A blocked store is not a reason to break the card. */
  }
}

/**
 * A wall-clock "HH:MM" read off the cabin screen, turned into a real instant at
 * the arrival airport. The day is picked as the one nearest the filed landing, so
 * a 05:40 landing does not land yesterday when the filed one says 05:10 tomorrow.
 * Returns null when there is nothing to anchor it against.
 */
export function cabinLandingAt(
  hhmm: string,
  filedAt: string | null | undefined,
  anchor: (local: string, tz: string | null) => string | null,
  tz: string | null,
): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const base = filedAt ? Date.parse(filedAt) : NaN;
  if (!Number.isFinite(base)) return null;

  /* Try the filed day and its neighbours; keep whichever lands closest to the
     filed time. The screen shows a clock, not a date. */
  const filedDay = filedAt!.slice(0, 10);
  const dayMs = Date.parse(`${filedDay}T00:00:00Z`);
  let best: string | null = null;
  let bestGap = Infinity;
  for (const shift of [-1, 0, 1]) {
    const day = new Date(dayMs + shift * 86_400_000).toISOString().slice(0, 10);
    const at = anchor(`${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`, tz);
    if (!at) continue;
    const gap = Math.abs(Date.parse(at) - base);
    if (Number.isFinite(gap) && gap < bestGap) {
      bestGap = gap;
      best = at;
    }
  }
  return best;
}

/** How far the cabin screen is off the filed time, in the traveller's words. */
export function cabinDriftWords(cabinAt: string, filedAt: string | null | undefined): string | null {
  const a = Date.parse(cabinAt);
  const b = filedAt ? Date.parse(filedAt) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mins = Math.round((a - b) / 60_000);
  if (mins === 0) return "the same as the filed landing";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return mins > 0 ? `${span} later than the filed landing` : `${span} earlier than the filed landing`;
}
