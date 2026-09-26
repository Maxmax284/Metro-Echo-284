// regionTint — the wash takes its hue from where you are standing.
//
// The painted walls (Taipei, Bangkok, Tokyo) are special stations. Every
// other place on Earth still gets a coherent wall: the climate band sets the
// base hue pair, the turn of day bends it. Procedural, no assets, globally
// extensible — that is the whole point.
//
// Doctrine:
//   - A stale fix does not repaint the world. The channel clears the
//     attributes; index.css falls back to the home hues.
//   - A chosen skin (data-skin) hard-sets its own hues and always wins over
//     the tint. The tint only ever paints the default skin.
//   - index.css owns every visual consequence of data-lat-band/data-daypart.
//
// Pure module: no IO, no React.

import { latBand, type LatBand } from "./station";
import type { Daypart } from "./daylight";

export type RegionTint = { band: LatBand; daypart: Daypart };

const BAND_ATTR = "data-lat-band";
const DAY_ATTR = "data-daypart";

/**
 * The tint for a fix, or null when there is no honest latitude. A missing
 * daypart is not fatal — the band alone still paints, the day bend stays
 * neutral. A missing latitude is: Echo does not guess at geography.
 */
export function regionTint(input: {
  lat?: unknown;
  daypart?: Daypart | null;
}): RegionTint | null {
  const lat = Number(input.lat);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  return { band: latBand(lat), daypart: input.daypart ?? "day" };
}

/** Write the tint onto <html>; null clears both attributes. */
export function applyRegionTint(tint: RegionTint | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!tint) {
    root.removeAttribute(BAND_ATTR);
    root.removeAttribute(DAY_ATTR);
    return;
  }
  if (root.getAttribute(BAND_ATTR) !== tint.band) root.setAttribute(BAND_ATTR, tint.band);
  if (root.getAttribute(DAY_ATTR) !== tint.daypart) root.setAttribute(DAY_ATTR, tint.daypart);
}

/** Read the current tint. Test/debug convenience. */
export function currentRegionTint(): RegionTint | null {
  if (typeof document === "undefined") return null;
  const band = document.documentElement.getAttribute(BAND_ATTR) as LatBand | null;
  if (!band) return null;
  return { band, daypart: (document.documentElement.getAttribute(DAY_ATTR) as Daypart | null) ?? "day" };
}
