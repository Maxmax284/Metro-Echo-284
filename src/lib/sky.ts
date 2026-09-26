// sky — the meteorological sky channel, kept strictly apart from the shell's
// operational weather.
//
// `data-weather` (lib/weather.ts) is task pressure: calm / drift / pressure.
// `data-sky` is the actual sky overhead: clear, cloud, rain, storm, snow, fog,
// wind. A thunderstorm must never read as overdue promises, and a pressured
// day must never paint storm clouds. Two attributes, two owners.
//
// Doctrine: the sky is written only from weather Echo already fetched for real
// reasons (the awareness snapshot, the field board's live read). Nothing here
// triggers a network call, and a stale reading clears the attribute instead
// of quietly repainting the room from old news.

export type Sky = "clear" | "cloud" | "rain" | "storm" | "snow" | "fog" | "wind";

const ATTR = "data-sky";

/** A sky reading older than this is history, not weather. */
export const SKY_STALE_MS = 3 * 60 * 60 * 1000;

/**
 * Map the snapshot's plain-word condition (written server-side by
 * awareness-snapshot's weatherCodeLabel) onto a sky kind. Unknown wording
 * returns null — Echo does not guess at the sky.
 */
export function skyFromCondition(condition: string | null | undefined): Sky | null {
  const c = (condition ?? "").trim().toLowerCase();
  if (!c) return null;
  if (c === "clear" || c === "sunny") return "clear";
  if (c.includes("cloud") || c === "overcast") return "cloud";
  if (c.includes("thunder") || c.includes("storm")) return "storm";
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return "rain";
  if (c.includes("snow") || c.includes("sleet") || c.includes("blizzard")) return "snow";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "fog";
  if (c.includes("wind") || c.includes("gale") || c.includes("gust")) return "wind";
  return null;
}

/** Same mapping straight from a WMO weather code (the field board's live read). */
export function skyFromWmo(code: number | null | undefined): Sky | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code <= 1) return "clear";
  if (code <= 3) return "cloud";
  if (code <= 48) return "fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return null;
}

/** True while a reading is fresh enough to change how the room feels. */
export function skyIsFresh(updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && now - t <= SKY_STALE_MS;
}

/**
 * Write the sky onto <html>. Null — or a stale reading — removes the
 * attribute: no sky claim is better than an old one. Visual consequences live
 * in index.css behind `html[data-sky=…]` so components stay unaware.
 */
export function applySky(sky: Sky | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!sky) {
    if (root.hasAttribute(ATTR)) root.removeAttribute(ATTR);
    return;
  }
  if (root.getAttribute(ATTR) !== sky) root.setAttribute(ATTR, sky);
}

/** Read the current sky. Test/debug convenience. */
export function currentSky(): Sky | null {
  if (typeof document === "undefined") return null;
  return (document.documentElement.getAttribute(ATTR) as Sky | null) ?? null;
}
