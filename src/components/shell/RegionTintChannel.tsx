// RegionTintChannel — keeps data-lat-band / data-daypart honest from the
// place Echo already knows.
//
// It reads the same awareness place as PlaceSkin and the boot; it never
// fetches, never prompts, never watches the device. A stale fix clears the
// tint rather than repaint the world from old news. The day bend follows the
// place's own timezone when the fix carries one, the device clock otherwise.
import { useEffect } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth } from "@/lib/placeTruth";
import { daypartInZone } from "@/lib/daylight";
import { applyRegionTint, regionTint } from "@/lib/regionTint";

export function RegionTintChannel() {
  const { place } = useAwareness();
  const truth = placeTruth(place);
  const geo = (place?.geo ?? {}) as { lat?: unknown; time_zone?: unknown };
  const tz = typeof geo.time_zone === "string" ? geo.time_zone : null;

  useEffect(() => {
    if (truth.stale) {
      applyRegionTint(null);
      return;
    }
    applyRegionTint(regionTint({ lat: geo.lat, daypart: daypartInZone(tz) }));
    // Re-apply on a slow tick so the day bend follows the hour.
    const t = window.setInterval(() => {
      applyRegionTint(regionTint({ lat: geo.lat, daypart: daypartInZone(tz) }));
    }, 5 * 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truth.stale, JSON.stringify(geo.lat ?? null), tz]);

  /* Leaving the signed-in shell clears the tint with it. */
  useEffect(() => () => applyRegionTint(null), []);

  return null;
}
