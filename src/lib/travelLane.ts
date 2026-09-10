// travelLane — reading a travel plan out of the calendar you already sync.
//
// Doctrine: no second travel system. Flights and stays are calendar entries
// Echo can already see; this file only classifies and orders them. Nothing is
// inferred beyond the words on the entry, and a missing time stays missing.

export type TravelKind = "flight" | "stay" | "transport";

export type TravelLeg = {
  id: string;
  kind: TravelKind;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
};

type EventLike = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
};

const FLIGHT = /\b(flight|flights|airlines?|airways|depart(?:ure)?s?\b|boarding|nonstop|to\s+[a-z]{3}\s*[-–]\s*[a-z]{3})\b/i;
const FLIGHT_CODE = /\b[A-Z]{2}\s?\d{2,4}\b/;
const STAY = /\b(hotel|hostel|inn|resort|motel|wyndham|marriott|hilton|hyatt|airbnb|check[- ]?in|check[- ]?out|stay|suites?|lodge|guesthouse)\b/i;
const TRANSPORT = /\b(train|bus|ferry|shuttle|rental car|car hire|taxi|transfer|railway|shinkansen|amtrak)\b/i;

/** What kind of travel an entry is, or null when it is ordinary work. */
export function travelKind(e: EventLike): TravelKind | null {
  const text = `${e.title ?? ""} ${e.location ?? ""}`;
  if (FLIGHT.test(text) || FLIGHT_CODE.test(e.title ?? "")) return "flight";
  if (STAY.test(text)) return "stay";
  if (TRANSPORT.test(text)) return "transport";
  return null;
}

/**
 * Travel legs in the order they happen. Anything already finished is dropped:
 * Today shows the plan ahead and what is running, not a travel archive.
 */
export function travelLegs(events: EventLike[], now = Date.now()): TravelLeg[] {
  const legs: TravelLeg[] = [];
  for (const e of events) {
    const kind = travelKind(e);
    if (!kind) continue;
    const end = e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime();
    if (Number.isFinite(end) && end < now) continue;
    legs.push({
      id: e.id,
      kind,
      title: e.title?.trim() || "Untitled entry",
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      all_day: e.all_day,
      location: e.location?.trim() || null,
    });
  }
  legs.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return legs;
}

/** True when a leg covers this moment — a stay you are in, a flight in the air. */
export function legRunning(leg: TravelLeg, now = Date.now()): boolean {
  const start = new Date(leg.starts_at).getTime();
  if (!Number.isFinite(start) || start > now) return false;
  if (!leg.ends_at) return false;
  const end = new Date(leg.ends_at).getTime();
  return Number.isFinite(end) && end > now;
}

const KIND_LABEL: Record<TravelKind, string> = {
  flight: "Flight",
  stay: "Stay",
  transport: "Transport",
};

export function legLabel(kind: TravelKind): string {
  return KIND_LABEL[kind];
}

/**
 * The window this travel plan covers, in plain words, or null when there is
 * nothing dated to describe. Never guesses an end date.
 */
export function travelWindow(legs: TravelLeg[]): { from: Date; to: Date | null } | null {
  if (legs.length === 0) return null;
  const from = new Date(legs[0].starts_at);
  let to: Date | null = null;
  for (const leg of legs) {
    if (!leg.ends_at) continue;
    const end = new Date(leg.ends_at);
    if (!to || end.getTime() > to.getTime()) to = end;
  }
  return { from, to };
}
