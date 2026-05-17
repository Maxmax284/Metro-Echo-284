// Geohash helper — Stage 7 foundation.
// Standard geohash-base32 encoder (Niemeyer 2008). Zero deps.
// Precision 6 ≈ 1.2km × 0.6km cells, the sweet spot for "same place"
// aggregation across distinct users without leaking exact GPS.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "";

  let minLat = -90, maxLat = 90;
  let minLng = -180, maxLng = 180;
  let hash = "";
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { bits = (bits << 1) | 1; minLng = mid; }
      else            { bits = (bits << 1);     maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { bits = (bits << 1) | 1; minLat = mid; }
      else            { bits = (bits << 1);     maxLat = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[bits];
      bits = 0;
      bit = 0;
    }
  }
  return hash;
}

/**
 * Pull a {lat, lng} pair out of whatever shape the geo column happens to
 * hold. Tolerant of: {lat,lng}, {latitude,longitude}, {coords:{...}}, GeoJSON
 * Point ({type:"Point",coordinates:[lng,lat]}), and string "lat,lng".
 */
export function extractLatLng(geo: unknown): { lat: number; lng: number } | null {
  if (!geo) return null;

  if (typeof geo === "string") {
    const parts = geo.split(",").map((s) => Number(s.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return { lat: parts[0], lng: parts[1] };
    }
    return null;
  }

  if (typeof geo !== "object") return null;
  const g = geo as Record<string, any>;

  const lat =
    g.lat ?? g.latitude ?? g.coords?.latitude ?? g.coords?.lat;
  const lng =
    g.lng ?? g.lon ?? g.long ?? g.longitude ?? g.coords?.longitude ?? g.coords?.lng;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat: Number(lat), lng: Number(lng) };
  }

  if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length === 2) {
    const [glng, glat] = g.coordinates.map(Number);
    if (Number.isFinite(glat) && Number.isFinite(glng)) {
      return { lat: glat, lng: glng };
    }
  }

  return null;
}

export function geohashFromGeo(geo: unknown, precision = 6): string | null {
  const ll = extractLatLng(geo);
  if (!ll) return null;
  const gh = encodeGeohash(ll.lat, ll.lng, precision);
  return gh || null;
}
