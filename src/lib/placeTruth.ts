// placeTruth — how precisely Echo is allowed to speak about where you are.
//
// Doctrine: never claim more precision than the fix supports. A 3km fix may
// name a city; it may not name a street. A pin the person dragged themselves
// is said out loud as theirs, and a fix nobody has refreshed in a while is
// said to be old rather than quietly reused as if it were current.
//
// Pure module: no IO, no React.

export type PlacePrecision = "street" | "neighbourhood" | "city" | "area" | "unknown";

export type PlaceSource = "device" | "manual" | "saved" | "unknown";

export type PlaceGeo = {
  lat?: number | null;
  lon?: number | null;
  /** Accuracy in metres, as the device reported it. */
  acc?: number | null;
  accuracy_m?: number | null;
  city?: string | null;
  source?: string | null;
  geocoded_at?: string | null;
};

export type PlaceLike = {
  label?: string | null;
  region?: string | null;
  country?: string | null;
  geo?: unknown;
  updated_at?: string | null;
};

export type PlaceTruth = {
  precision: PlacePrecision;
  source: PlaceSource;
  /** True when the person placed the pin by hand. */
  setByYou: boolean;
  /** The most precise name we are allowed to use, or null. */
  name: string | null;
  /** One sentence: where Echo thinks you are and how sure it is. */
  line: string;
  /** Age of the fix in plain words, or null when nothing was recorded. */
  age: string | null;
  /** True when the fix is old enough that it should not be spoken as "now". */
  stale: boolean;
};

const HOUR = 60 * 60 * 1000;
const STALE_MS = 12 * HOUR;

function geoOf(place: PlaceLike | null | undefined): PlaceGeo {
  const g = (place?.geo ?? {}) as PlaceGeo;
  return g && typeof g === "object" ? g : {};
}

/** Metres of accuracy, or null when the fix never said. */
export function accuracyMetres(place: PlaceLike | null | undefined): number | null {
  const g = geoOf(place);
  const raw = g.acc ?? g.accuracy_m ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The most precise thing the fix earns the right to say. */
export function precisionFor(acc: number | null): PlacePrecision {
  if (acc == null) return "unknown";
  if (acc <= 50) return "street";
  if (acc <= 500) return "neighbourhood";
  if (acc <= 5_000) return "city";
  return "area";
}

export function sourceFor(place: PlaceLike | null | undefined): PlaceSource {
  const s = String(geoOf(place).source ?? "").toLowerCase();
  /* Every tag a deliberate hand-fix can carry — a dragged pin, a map pick, a
     search after a bad fix. All of them are "you set this". */
  if (["manual", "pin", "dragged", "manual_fix", "map_picker", "manual_search", "nearby_suggestion"].includes(s)) return "manual";
  if (s === "device" || s === "gps") return "device";
  if (s === "saved") return "saved";
  return "unknown";
}

function agePhrase(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((now - t) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The one read of where you are. Callers never write their own version of
 * this sentence, so Today and the Aware room cannot disagree.
 */
export function placeTruth(place: PlaceLike | null | undefined, now = Date.now()): PlaceTruth {
  if (!place) {
    return {
      precision: "unknown",
      source: "unknown",
      setByYou: false,
      name: null,
      line: "Echo has no place to work from yet. Set where you are and it can start reading around you.",
      age: null,
      stale: false,
    };
  }

  const g = geoOf(place);
  const acc = accuracyMetres(place);
  const precision = precisionFor(acc);
  const source = sourceFor(place);
  const setByYou = source === "manual";
  const age = agePhrase(place.updated_at ?? g.geocoded_at ?? null, now);
  const fixAt = place.updated_at ? new Date(place.updated_at).getTime() : NaN;
  const stale = Number.isFinite(fixAt) ? now - fixAt > STALE_MS : false;

  const named = g.city || place.region || place.country || null;
  const name = named ?? null;

  const parts: string[] = [];
  if (!name) {
    parts.push(
      setByYou
        ? "You placed this pin yourself, and Echo still can't tell what's there."
        : "Echo has a fix but can't tell what's there yet.",
    );
  } else if (precision === "street" || precision === "neighbourhood") {
    parts.push(setByYou ? `You set this to ${name}.` : `You're in ${name}.`);
  } else if (precision === "city") {
    parts.push(setByYou ? `You set this to ${name}.` : `You're somewhere in ${name}.`);
  } else if (precision === "area") {
    parts.push(`Somewhere around ${name} — the fix is wide.`);
  } else {
    parts.push(setByYou ? `You set this to ${name}.` : `Echo is working from ${name}.`);
  }

  if (stale && age) parts.push(`That was ${age}, so treat it as the last place Echo knew.`);
  else if (age && !setByYou) parts.push(`Fix taken ${age}.`);

  if (precision === "area" && acc) parts.push(`Accurate to about ${Math.round(acc / 1000)}km.`);

  return { precision, source, setByYou, name, line: parts.join(" "), age, stale };
}

/** Short badge text: "Set by you", "From your device", "Last known". */
export function placeSourceBadge(truth: PlaceTruth): string {
  if (truth.setByYou) return "Location set by you";
  if (truth.stale) return "Last known place";
  if (truth.source === "device") return "From your device";
  if (truth.source === "saved") return "Saved place";
  /* Nothing recorded how this place was set, and Echo will not invent it. */
  return "How this was set wasn't recorded";
}
