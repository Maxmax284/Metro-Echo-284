// placeSkin — which city wall the room stands in.
//
// Doctrine:
//   - A kept table, never a guess. A place Echo has no painted wall for keeps
//     the room's own wall and says nothing about it.
//   - A stale fix does not repaint the world. Old position, home wall.
//   - The place layer is light and texture behind content. It never becomes a
//     second tag fighting the room's own, and it carries no information.
//
// Pure module: no IO, no React.

export type PlaceSkin = "taipei" | "bangkok" | "tokyo";

/** City name (lower case) to the painted wall kept for it. */
const CITY: Record<string, PlaceSkin> = {
  taipei: "taipei",
  taoyuan: "taipei",
  kaohsiung: "taipei",
  taichung: "taipei",
  bangkok: "bangkok",
  "krung thep": "bangkok",
  nonthaburi: "bangkok",
  tokyo: "tokyo",
  yokohama: "tokyo",
  osaka: "tokyo",
  kyoto: "tokyo",
};

/** Country (name or ISO code) to its wall, when the whole country shares one. */
const COUNTRY: Record<string, PlaceSkin> = {
  TW: "taipei",
  TAIWAN: "taipei",
  TH: "bangkok",
  THAILAND: "bangkok",
  JP: "tokyo",
  JAPAN: "tokyo",
};

/**
 * The wall for where you are standing, or null to keep the room's own.
 * The city wins over the country: standing in Osaka is still the Tokyo wall,
 * but a named city Echo knows is the better fact.
 */
export function placeSkin(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  /** True when the fix is too old to be spoken as "now". */
  stale?: boolean;
}): PlaceSkin | null {
  if (input.stale) return null;
  const city = (input.city ?? "").trim().toLowerCase();
  if (city && CITY[city]) return CITY[city];
  const region = (input.region ?? "").trim().toLowerCase();
  if (region && CITY[region]) return CITY[region];
  const country = (input.country ?? "").trim().toUpperCase();
  if (country && COUNTRY[country]) return COUNTRY[country];
  return null;
}

/** How Echo would say it, for the one line under the wall. */
export const PLACE_SKIN_WORDS: Record<PlaceSkin, string> = {
  taipei: "Taipei",
  bangkok: "Bangkok",
  tokyo: "Tokyo",
};
