// RegionTintChannel — keeps the world-identity attributes honest from the
// place Echo already knows: data-lat-band / data-daypart / data-season
// (procedural, every latitude) and data-region (the seeded tier above them).
//
// It reads the same awareness place as PlaceSkin and the boot; it never
// fetches, never prompts, never watches the device. A stale fix clears all
// four attributes rather than repaint the world from old news. The day bend
// follows the place's own timezone when the fix carries one, the device
// clock otherwise. The season comes from station.ts — band, hemisphere and
// date, no northern assumption. The region tier needs no clock — it rides
// the place row's own country and region, and an unmapped place simply gets
// no claim.
import { useEffect } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth } from "@/lib/placeTruth";
import { daypartInZone } from "@/lib/daylight";
import { seasonFor } from "@/lib/station";
import { applyRegionTint, applySeason, regionTint } from "@/lib/regionTint";
import { applyRegion, regionAtmosphere } from "@/lib/regions";

export function RegionTintChannel() {
  const { place } = useAwareness();
  const truth = placeTruth(place);
  const geo = (place?.geo ?? {}) as { lat?: unknown; time_zone?: unknown; city?: string | null };
  const tz = typeof geo.time_zone === "string" ? geo.time_zone : null;
  const lat = typeof geo.lat === "number" && Number.isFinite(geo.lat) ? geo.lat : null;
  const city = typeof geo.city === "string" ? geo.city : (truth.name ?? null);
  const country = place?.country ?? null;
  const region = place?.region ?? null;

  useEffect(() => {
    if (truth.stale) {
      applyRegionTint(null);
      applyRegion(null);
      applySeason(null);
      return;
    }
    const paint = () => {
      applyRegionTint(regionTint({ lat: geo.lat, daypart: daypartInZone(tz) }));
      applySeason(lat != null ? seasonFor(new Date(), lat).key : null);
    };
    applyRegion(regionAtmosphere({ country, region, city }));
    paint();
    // Re-apply on a slow tick so the day bend and the season follow the hour.
    const t = window.setInterval(paint, 5 * 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truth.stale, JSON.stringify(geo.lat ?? null), tz, country, region, city]);

  /* Leaving the signed-in shell clears the world identity with it. */
  useEffect(
    () => () => {
      applyRegionTint(null);
      applyRegion(null);
      applySeason(null);
    },
    [],
  );

  return null;
}
