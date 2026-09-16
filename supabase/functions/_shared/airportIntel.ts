// airportIntel — what is actually inside the terminal you are sitting in.
//
// Doctrine:
//   - Listings come from a places provider, not from Echo's imagination. A place
//     with no published hours is shown with no hours, never "probably open".
//   - "Open now" is only said when the provider said it, and it carries the time
//     of the reading, because a 4am terminal is where that claim goes wrong.
//   - Categories are the things a person actually needs at 3am, in that order:
//     water, food, a pharmacy, a SIM, somewhere to lie down.
//   - Nothing here dials, books, or orders anything.
//
// Pure module: no IO, no React.

export const INTEL_LAW =
  "Listings come from a places provider with the time of the reading on them. Hours are shown only where they are published, and Echo never guesses whether something is open.";

export type IntelCategory = "water" | "food" | "coffee" | "pharmacy" | "sim" | "rest" | "shower" | "atm";

export type CategorySpec = {
  key: IntelCategory;
  label: string;
  /** What a person is looking for, in their words. */
  need: string;
  /** The query handed to the places provider. */
  query: string;
};

export const CATEGORIES: CategorySpec[] = [
  { key: "water", label: "Water and snacks", need: "somewhere to buy water", query: "convenience store" },
  { key: "food", label: "Food", need: "a proper meal", query: "restaurant" },
  { key: "coffee", label: "Coffee", need: "coffee", query: "coffee shop" },
  { key: "pharmacy", label: "Pharmacy", need: "medicine or a pharmacy", query: "pharmacy" },
  { key: "sim", label: "SIM and data", need: "a local SIM or data", query: "mobile phone SIM card shop" },
  { key: "rest", label: "Somewhere to sit or sleep", need: "somewhere to lie down", query: "lounge or sleeping pod" },
  { key: "shower", label: "Shower", need: "a shower", query: "shower" },
  { key: "atm", label: "Cash", need: "cash", query: "ATM" },
];

export function categorySpec(key: string): CategorySpec | null {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}

export type IntelPlace = {
  id: string;
  name: string;
  /** Where the provider says it is. Often carries the terminal. */
  address: string | null;
  kind: string | null;
  /** Only when the provider said so. Null means the provider did not say. */
  open_now: boolean | null;
  /** Published hours, verbatim, or an empty list. */
  hours: string[];
};

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/**
 * One Places API (New) searchText payload, narrowed to what a person in a
 * terminal needs. Nothing is invented and nothing is ranked by rating: a place
 * that exists and is near you beats a place with better stars two terminals over.
 */
export function normalizePlaces(payload: unknown, limit = 8): IntelPlace[] {
  const rows = Array.isArray((payload as any)?.places) ? ((payload as any).places as any[]) : [];
  const out: IntelPlace[] = [];
  for (const r of rows) {
    const name = str(r?.displayName?.text);
    const id = str(r?.id);
    if (!name || !id) continue;
    const openNow = r?.currentOpeningHours?.openNow;
    const hours = Array.isArray(r?.regularOpeningHours?.weekdayDescriptions)
      ? (r.regularOpeningHours.weekdayDescriptions as unknown[]).map((h) => str(h)).filter((h): h is string => !!h)
      : [];
    out.push({
      id,
      name,
      address: str(r?.formattedAddress),
      kind: str(r?.primaryTypeDisplayName?.text),
      open_now: typeof openNow === "boolean" ? openNow : null,
      hours,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** How a listing reads on the card. Hours only where published. */
export function placeWords(p: IntelPlace): string {
  const bits: string[] = [p.name];
  if (p.kind) bits.push(p.kind);
  if (p.open_now === true) bits.push("open at the time of the reading");
  else if (p.open_now === false) bits.push("closed at the time of the reading");
  else bits.push("hours not published");
  return bits.join(" · ");
}

/** What Echo says when a category came back empty. Empty is an answer. */
export function emptyWords(spec: CategorySpec, place: string): string {
  return `The places provider listed nothing for ${spec.need} at ${place}. That is what it returned, not proof there is nothing there — terminal listings are patchy.`;
}

/** A cache older than this is worth reading again. Terminals do not change hourly. */
export const CACHE_DAYS = 7;

export function cacheStale(fetchedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > CACHE_DAYS * 24 * 3_600_000;
}

export function readingAgeWords(fetchedAt: string | null | undefined, now: Date = new Date()): string {
  if (!fetchedAt) return "not read yet";
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return "read at an unrecorded time";
  const mins = Math.round((now.getTime() - t) / 60_000);
  if (mins < 60) return `read ${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "read an hour ago" : `read ${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "read yesterday" : `read ${days} days ago`;
}
