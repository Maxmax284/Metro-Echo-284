// locationSanity — high-accuracy GPS sampling + bad-pin detection.
//
// PWA reality: we can't out-triangulate Google Maps. What we CAN do is stop
// trusting the first reading the browser hands us. We sample for a few
// seconds, pick the best fix, and flag pins that look offshore/unresolvable.

export type GpsSample = {
  lat: number;
  lon: number;
  acc: number; // meters
  ts: number;
};

export type GpsResult = {
  best: GpsSample;
  samples: GpsSample[];
};

const DEFAULT_WINDOW_MS = 7000;

/**
 * Sample GPS for a short window and return the best fix.
 * Stops on its own — no leaked watchPosition.
 */
export function sampleHighAccuracy(
  windowMs = DEFAULT_WINDOW_MS,
  onSample?: (s: GpsSample, count: number) => void,
): Promise<GpsResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("no_geolocation"));
      return;
    }
    const samples: GpsSample[] = [];
    let settled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const s: GpsSample = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy ?? 99999,
          ts: pos.timestamp ?? Date.now(),
        };
        samples.push(s);
        onSample?.(s, samples.length);
      },
      (err) => {
        if (settled) return;
        if (samples.length === 0) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          reject(err);
        }
      },
      { enableHighAccuracy: true, timeout: windowMs + 2000, maximumAge: 0 },
    );
    setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      if (samples.length === 0) {
        reject(new Error("no_samples"));
        return;
      }
      // Best = lowest accuracy radius, ties broken by newest.
      const best = [...samples].sort((a, b) =>
        a.acc !== b.acc ? a.acc - b.acc : b.ts - a.ts,
      )[0];
      resolve({ best, samples });
    }, windowMs);
  });
}

/** Haversine meters between two coords. */
export function distMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type BadnessReason =
  | "no_country"
  | "no_region"
  | "no_city"
  | "low_accuracy"
  | "stale_fix"
  | "same_as_previous_bad"
  | "open_water_hint";

export type PlaceBadness = {
  bad: boolean;
  reasons: BadnessReason[];
  headline: string;
};

/**
 * Classify whether a saved place is unusable. Driven by the data the
 * geocoder already returned. Open-water gets flagged because reverse
 * geocoding lands no country/region/city.
 */
/**
 * classifyPlaceBadness — only true when the PLACE itself is unresolved.
 *
 * A valid broad place (country present, or land-nearby) is NEVER "bad",
 * even if the raw GPS coordinate is offshore or low-accuracy. Pin quality
 * and place validity are separate concerns — see awarenessLocation.ts.
 */
export function classifyPlaceBadness(place: {
  country: string | null;
  region: string | null;
  geo?: any;
} | null): PlaceBadness {
  if (!place) return { bad: false, reasons: [], headline: "" };
  const city = place.geo?.city ?? null;
  const sanity: string | null = place.geo?.sanity ?? null;

  // Valid broad place — country resolved. Pin issues handled separately.
  if (place.country) return { bad: false, reasons: [], headline: "" };
  if (sanity === "land_nearby" && (city || place.region)) {
    return { bad: false, reasons: [], headline: "" };
  }

  const reasons: BadnessReason[] = [];
  if (!place.country) reasons.push("no_country");
  if (!place.region) reasons.push("no_region");
  if (!city) reasons.push("no_city");
  if (sanity === "offshore_confirmed") {
    return {
      bad: true,
      reasons: ["open_water_hint"],
      headline: "GPS pin looks offshore. Pick a nearby place.",
    };
  }
  if (!place.country && !place.region && !city) reasons.push("open_water_hint");

  // No country and no resolution data → unresolved place.
  return {
    bad: true,
    reasons,
    headline: "This place isn't resolved yet.",
  };
}

// ---------- Manual place search (Nominatim forward geocode) ----------------

export type PlaceSearchHit = {
  display_name: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
  city?: string;
};

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, {
    headers: { "Accept-Language": "en" },
    signal,
  });
  if (!r.ok) throw new Error(`search_${r.status}`);
  const rows = (await r.json()) as any[];
  return rows.map((row) => ({
    display_name: row.display_name as string,
    lat: Number(row.lat),
    lon: Number(row.lon),
    country: row.address?.country,
    region: row.address?.state ?? row.address?.region ?? row.address?.province,
    city:
      row.address?.city ??
      row.address?.town ??
      row.address?.village ??
      row.address?.municipality,
  }));
}
