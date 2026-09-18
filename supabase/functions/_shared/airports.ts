// airports — a small kept table of the hubs Echo can speak about by name.
//
// Doctrine:
//   - Kept by hand, not scraped. Every entry is a fact somebody checked.
//   - An airport that is not here is not guessed at. Echo says the code and
//     admits it does not know the city, the country or the clock there.
//   - Country is here so Echo can say whether a connection crosses a border.
//     Without it, it says immigration is unknown rather than assuming.
//
// Pure module: no IO, no React.

export type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  /** ISO-3166 alpha-2, so country notes can be found. */
  cc: string;
  tz: string;
};

const LIST: Airport[] = [
  { iata: "IAD", name: "Washington Dulles", city: "Washington", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "DCA", name: "Reagan National", city: "Washington", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "BWI", name: "Baltimore/Washington", city: "Baltimore", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "JFK", name: "John F. Kennedy", city: "New York", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "EWR", name: "Newark Liberty", city: "Newark", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "LGA", name: "LaGuardia", city: "New York", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "BOS", name: "Boston Logan", city: "Boston", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "PHL", name: "Philadelphia", city: "Philadelphia", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "ATL", name: "Hartsfield–Jackson", city: "Atlanta", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "MIA", name: "Miami", city: "Miami", country: "United States", cc: "US", tz: "America/New_York" },
  { iata: "ORD", name: "O'Hare", city: "Chicago", country: "United States", cc: "US", tz: "America/Chicago" },
  { iata: "DFW", name: "Dallas/Fort Worth", city: "Dallas", country: "United States", cc: "US", tz: "America/Chicago" },
  { iata: "IAH", name: "George Bush", city: "Houston", country: "United States", cc: "US", tz: "America/Chicago" },
  { iata: "DEN", name: "Denver", city: "Denver", country: "United States", cc: "US", tz: "America/Denver" },
  { iata: "LAX", name: "Los Angeles", city: "Los Angeles", country: "United States", cc: "US", tz: "America/Los_Angeles" },
  { iata: "SFO", name: "San Francisco", city: "San Francisco", country: "United States", cc: "US", tz: "America/Los_Angeles" },
  { iata: "SEA", name: "Seattle–Tacoma", city: "Seattle", country: "United States", cc: "US", tz: "America/Los_Angeles" },
  { iata: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "Canada", cc: "CA", tz: "America/Toronto" },
  { iata: "YVR", name: "Vancouver", city: "Vancouver", country: "Canada", cc: "CA", tz: "America/Vancouver" },
  { iata: "LHR", name: "Heathrow", city: "London", country: "United Kingdom", cc: "GB", tz: "Europe/London" },
  { iata: "LGW", name: "Gatwick", city: "London", country: "United Kingdom", cc: "GB", tz: "Europe/London" },
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France", cc: "FR", tz: "Europe/Paris" },
  { iata: "AMS", name: "Schiphol", city: "Amsterdam", country: "Netherlands", cc: "NL", tz: "Europe/Amsterdam" },
  { iata: "FRA", name: "Frankfurt", city: "Frankfurt", country: "Germany", cc: "DE", tz: "Europe/Berlin" },
  { iata: "MUC", name: "Munich", city: "Munich", country: "Germany", cc: "DE", tz: "Europe/Berlin" },
  { iata: "MAD", name: "Barajas", city: "Madrid", country: "Spain", cc: "ES", tz: "Europe/Madrid" },
  { iata: "BCN", name: "El Prat", city: "Barcelona", country: "Spain", cc: "ES", tz: "Europe/Madrid" },
  { iata: "FCO", name: "Fiumicino", city: "Rome", country: "Italy", cc: "IT", tz: "Europe/Rome" },
  { iata: "IST", name: "Istanbul", city: "Istanbul", country: "Türkiye", cc: "TR", tz: "Europe/Istanbul" },
  { iata: "ZRH", name: "Zurich", city: "Zurich", country: "Switzerland", cc: "CH", tz: "Europe/Zurich" },
  { iata: "DUB", name: "Dublin", city: "Dublin", country: "Ireland", cc: "IE", tz: "Europe/Dublin" },
  { iata: "DXB", name: "Dubai International", city: "Dubai", country: "United Arab Emirates", cc: "AE", tz: "Asia/Dubai" },
  { iata: "AUH", name: "Zayed International", city: "Abu Dhabi", country: "United Arab Emirates", cc: "AE", tz: "Asia/Dubai" },
  { iata: "DOH", name: "Hamad International", city: "Doha", country: "Qatar", cc: "QA", tz: "Asia/Qatar" },
  { iata: "BAH", name: "Bahrain International", city: "Manama", country: "Bahrain", cc: "BH", tz: "Asia/Bahrain" },
  { iata: "DEL", name: "Indira Gandhi", city: "Delhi", country: "India", cc: "IN", tz: "Asia/Kolkata" },
  { iata: "BOM", name: "Chhatrapati Shivaji", city: "Mumbai", country: "India", cc: "IN", tz: "Asia/Kolkata" },
  { iata: "CMB", name: "Bandaranaike", city: "Colombo", country: "Sri Lanka", cc: "LK", tz: "Asia/Colombo" },
  { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "Thailand", cc: "TH", tz: "Asia/Bangkok" },
  { iata: "DMK", name: "Don Mueang", city: "Bangkok", country: "Thailand", cc: "TH", tz: "Asia/Bangkok" },
  { iata: "HKT", name: "Phuket", city: "Phuket", country: "Thailand", cc: "TH", tz: "Asia/Bangkok" },
  { iata: "CNX", name: "Chiang Mai", city: "Chiang Mai", country: "Thailand", cc: "TH", tz: "Asia/Bangkok" },
  { iata: "USM", name: "Samui", city: "Koh Samui", country: "Thailand", cc: "TH", tz: "Asia/Bangkok" },
  { iata: "SIN", name: "Changi", city: "Singapore", country: "Singapore", cc: "SG", tz: "Asia/Singapore" },
  { iata: "KUL", name: "Kuala Lumpur", city: "Kuala Lumpur", country: "Malaysia", cc: "MY", tz: "Asia/Kuala_Lumpur" },
  { iata: "HKG", name: "Hong Kong International", city: "Hong Kong", country: "Hong Kong", cc: "HK", tz: "Asia/Hong_Kong" },
  { iata: "TPE", name: "Taoyuan", city: "Taipei", country: "Taiwan", cc: "TW", tz: "Asia/Taipei" },
  { iata: "NRT", name: "Narita", city: "Tokyo", country: "Japan", cc: "JP", tz: "Asia/Tokyo" },
  { iata: "HND", name: "Haneda", city: "Tokyo", country: "Japan", cc: "JP", tz: "Asia/Tokyo" },
  { iata: "KIX", name: "Kansai", city: "Osaka", country: "Japan", cc: "JP", tz: "Asia/Tokyo" },
  { iata: "ICN", name: "Incheon", city: "Seoul", country: "South Korea", cc: "KR", tz: "Asia/Seoul" },
  { iata: "PVG", name: "Pudong", city: "Shanghai", country: "China", cc: "CN", tz: "Asia/Shanghai" },
  { iata: "SGN", name: "Tan Son Nhat", city: "Ho Chi Minh City", country: "Vietnam", cc: "VN", tz: "Asia/Ho_Chi_Minh" },
  { iata: "HAN", name: "Noi Bai", city: "Hanoi", country: "Vietnam", cc: "VN", tz: "Asia/Ho_Chi_Minh" },
  { iata: "PNH", name: "Phnom Penh", city: "Phnom Penh", country: "Cambodia", cc: "KH", tz: "Asia/Phnom_Penh" },
  { iata: "MNL", name: "Ninoy Aquino", city: "Manila", country: "Philippines", cc: "PH", tz: "Asia/Manila" },
  { iata: "CGK", name: "Soekarno–Hatta", city: "Jakarta", country: "Indonesia", cc: "ID", tz: "Asia/Jakarta" },
  { iata: "DPS", name: "Ngurah Rai", city: "Denpasar", country: "Indonesia", cc: "ID", tz: "Asia/Makassar" },
  { iata: "SYD", name: "Kingsford Smith", city: "Sydney", country: "Australia", cc: "AU", tz: "Australia/Sydney" },
  { iata: "MEL", name: "Tullamarine", city: "Melbourne", country: "Australia", cc: "AU", tz: "Australia/Melbourne" },
  { iata: "AKL", name: "Auckland", city: "Auckland", country: "New Zealand", cc: "NZ", tz: "Pacific/Auckland" },
  { iata: "ADD", name: "Bole", city: "Addis Ababa", country: "Ethiopia", cc: "ET", tz: "Africa/Addis_Ababa" },
  { iata: "CAI", name: "Cairo", city: "Cairo", country: "Egypt", cc: "EG", tz: "Africa/Cairo" },
  { iata: "JNB", name: "O. R. Tambo", city: "Johannesburg", country: "South Africa", cc: "ZA", tz: "Africa/Johannesburg" },
  { iata: "GRU", name: "Guarulhos", city: "São Paulo", country: "Brazil", cc: "BR", tz: "America/Sao_Paulo" },
  { iata: "MEX", name: "Benito Juárez", city: "Mexico City", country: "Mexico", cc: "MX", tz: "America/Mexico_City" },
  { iata: "PTY", name: "Tocumen", city: "Panama City", country: "Panama", cc: "PA", tz: "America/Panama" },
];

const BY_IATA = new Map(LIST.map((a) => [a.iata, a]));

/** The airport, or null. Null is an answer: Echo then speaks only the code. */
export function airport(iata: string | null | undefined): Airport | null {
  const code = (iata ?? "").trim().toUpperCase();
  return code ? (BY_IATA.get(code) ?? null) : null;
}

/** "Tokyo (NRT)" when known, "NRT" when not. Never an invented city. */
export function airportWords(iata: string | null | undefined): string {
  const code = (iata ?? "").trim().toUpperCase();
  if (!code) return "an airport not on record";
  const a = BY_IATA.get(code);
  return a ? `${a.city} (${code})` : code;
}

/**
 * Whether a connection crosses a border. "unknown" when either end is not in
 * the kept table — Echo would rather say it does not know than tell you to
 * budget for immigration you do not have to clear.
 */
export function bordersCrossed(fromIata: string | null, toIata: string | null): "same" | "different" | "unknown" {
  const a = airport(fromIata);
  const b = airport(toIata);
  if (!a || !b) return "unknown";
  return a.cc === b.cc ? "same" : "different";
}

export function airportCount(): number {
  return LIST.length;
}

/* ---- Where an airport sits ------------------------------------------------
   Kept by hand, same rule as the rest of this table: an airport with no
   coordinate here has none, and a radar fix near it is reported as a fix
   without a place on the track rather than pinned to a guess. */

export type Point = { lat: number; lon: number };

const POINTS: Record<string, Point> = {
  IAD: { lat: 38.9531, lon: -77.4565 },
  DCA: { lat: 38.8512, lon: -77.0402 },
  BWI: { lat: 39.1754, lon: -76.6683 },
  JFK: { lat: 40.6413, lon: -73.7781 },
  EWR: { lat: 40.6895, lon: -74.1745 },
  LGA: { lat: 40.7769, lon: -73.874 },
  BOS: { lat: 42.3656, lon: -71.0096 },
  PHL: { lat: 39.8744, lon: -75.2424 },
  ATL: { lat: 33.6407, lon: -84.4277 },
  MIA: { lat: 25.7959, lon: -80.287 },
  ORD: { lat: 41.9742, lon: -87.9073 },
  DFW: { lat: 32.8998, lon: -97.0403 },
  IAH: { lat: 29.9902, lon: -95.3368 },
  DEN: { lat: 39.8561, lon: -104.6737 },
  LAX: { lat: 33.9416, lon: -118.4085 },
  SFO: { lat: 37.6213, lon: -122.379 },
  SEA: { lat: 47.4502, lon: -122.3088 },
  YYZ: { lat: 43.6777, lon: -79.6248 },
  MEX: { lat: 19.4363, lon: -99.0721 },
  PTY: { lat: 9.0714, lon: -79.3835 },
  LHR: { lat: 51.47, lon: -0.4543 },
  CDG: { lat: 49.0097, lon: 2.5479 },
  AMS: { lat: 52.3105, lon: 4.7683 },
  FRA: { lat: 50.0379, lon: 8.5622 },
  MAD: { lat: 40.4839, lon: -3.568 },
  BCN: { lat: 41.2974, lon: 2.0833 },
  DXB: { lat: 25.2532, lon: 55.3657 },
  SIN: { lat: 1.3644, lon: 103.9915 },
  HKG: { lat: 22.308, lon: 113.9185 },
  TPE: { lat: 25.0777, lon: 121.2328 },
  BKK: { lat: 13.69, lon: 100.7501 },
  NRT: { lat: 35.772, lon: 140.3929 },
  HND: { lat: 35.5494, lon: 139.7798 },
  ICN: { lat: 37.4602, lon: 126.4407 },
};

/** The airport's coordinate, or null when it is not on record. */
export function airportPoint(iata: string | null | undefined): Point | null {
  const code = (iata ?? "").trim().toUpperCase();
  return code ? (POINTS[code] ?? null) : null;
}

/** Great-circle distance in kilometres between two coordinates. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
