// PlaceSkin — the wall knows which city it is standing in.
//
// Doctrine:
//   - It reads the place other things already fetched. No watcher, no device
//     prompt, no new query.
//   - A stale or unknown fix leaves the room's own wall alone. Echo never
//     repaints the world on a guess.
//   - Renders nothing. index.css owns every visual consequence of data-place.
import { useEffect } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth } from "@/lib/placeTruth";
import { placeSkin } from "@/lib/placeSkin";

export function PlaceSkin() {
  const { place } = useAwareness();
  const truth = placeTruth(place);
  const geo = (place?.geo ?? {}) as { city?: string | null };

  const skin = placeSkin({
    city: geo.city ?? truth.name ?? null,
    region: place?.region ?? null,
    country: place?.country ?? null,
    stale: truth.stale,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (skin) root.setAttribute("data-place", skin);
    else root.removeAttribute("data-place");
    return () => root.removeAttribute("data-place");
  }, [skin]);

  return null;
}
