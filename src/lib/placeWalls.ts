// placeWalls — the painted wall Echo keeps for a place.
//
// Doctrine:
//   - The same kept table the room backdrop uses (placeSkin). A place with no
//     painted wall says so; nothing is generated on the spot.
//   - A wall is art behind facts. It never carries information.
import taipeiWall from "@/assets/place-wall-taipei.jpg";
import bangkokWall from "@/assets/place-wall-bangkok.jpg";
import tokyoWall from "@/assets/place-wall-tokyo.jpg";
import { placeSkin, PLACE_SKIN_WORDS, type PlaceSkin } from "@/lib/placeSkin";

const WALL: Record<PlaceSkin, string> = {
  taipei: taipeiWall,
  bangkok: bangkokWall,
  tokyo: tokyoWall,
};

export type PlaceWall = { skin: PlaceSkin; url: string; words: string };

/** The wall for a city/country on record, or null when Echo keeps none. */
export function wallFor(input: { city?: string | null; country?: string | null }): PlaceWall | null {
  const skin = placeSkin({ city: input.city ?? null, country: input.country ?? null });
  if (!skin) return null;
  return { skin, url: WALL[skin], words: PLACE_SKIN_WORDS[skin] };
}
