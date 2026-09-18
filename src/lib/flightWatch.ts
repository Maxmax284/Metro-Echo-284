// flightWatch — when the deck is allowed to re-read a flight by itself.
//
// Doctrine:
//   - A reading is paid for. Automatic readings only happen close to the flight,
//     and only while the deck is actually on screen.
//   - The rules here mirror the server's own window; the server is the ceiling,
//     this is only about not asking pointlessly.
//   - Nothing here writes, books, or notifies. It decides whether to look.
import type { FlightPlan } from "@/lib/flightPlan";
import type { LiveFlight } from "@/lib/flightStatus";

/** A reading younger than this is reused rather than paid for again. */
export const REREAD_MS = 5 * 60_000;
/** How far ahead of a departure automatic readings begin. */
const BEFORE_MS = 30 * 60 * 60_000;
/** How long after the landing on record automatic readings continue. */
const AFTER_MS = 4 * 60 * 60_000;

function ms(iso: string | null | undefined): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** The departure instant Echo has on record for this flight, ticket or airline. */
export function plannedDeparture(plan: FlightPlan): number | null {
  const live = plan.live_status as LiveFlight | null;
  const chosen = plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null;
  return (
    ms(live?.departure.actual) ??
    ms(live?.departure.estimated) ??
    ms(live?.departure.scheduled) ??
    ms(chosen?.depart_at ?? null) ??
    ms(plan.depart_on ? `${plan.depart_on.slice(0, 10)}T00:00:00Z` : null)
  );
}

/** The landing instant on record, or a generous guess of when the day is over. */
function plannedArrival(plan: FlightPlan, dep: number): number {
  const live = plan.live_status as LiveFlight | null;
  return (
    ms(live?.arrival.actual) ??
    ms(live?.arrival.estimated) ??
    ms(live?.arrival.scheduled) ??
    dep + 20 * 60 * 60_000
  );
}

/** True when this flight is close enough to be worth an unattended reading. */
export function insideWatchWindow(plan: FlightPlan, now = Date.now()): boolean {
  if (plan.status === "dropped") return false;
  if (plan.ownership === "unknown") return false;
  const dep = plannedDeparture(plan);
  if (dep === null) return false;
  const arr = plannedArrival(plan, dep);
  return now >= dep - BEFORE_MS && now <= arr + AFTER_MS;
}

/** True when the last reading is old enough that a fresh one would say more. */
export function readingDue(plan: FlightPlan, now = Date.now()): boolean {
  const stamp = ms(plan.live_checked_at);
  return stamp === null || now - stamp >= REREAD_MS;
}

/**
 * The one flight the deck should refresh on this tick, or null. One at a time,
 * oldest reading first, so a screen full of flights never fires a burst.
 */
export function nextToRead(plans: FlightPlan[], now = Date.now()): FlightPlan | null {
  const due = plans.filter((p) => insideWatchWindow(p, now) && readingDue(p, now));
  if (!due.length) return null;
  return due.sort((a, b) => (ms(a.live_checked_at) ?? 0) - (ms(b.live_checked_at) ?? 0))[0];
}
