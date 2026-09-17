// careFinder — where care is, where you are standing.
//
// Doctrine:
//   - Map data, not a guess. Every row here came from an OpenStreetMap record;
//     a field the map did not carry stays blank instead of being filled in.
//   - Echo shows. It never calls, never books an appointment, and never says
//     what you should do about your body.
//   - The published emergency number stays above the list, because in the worst
//     minute a phone number beats a directory.
//   - Distances are straight-line from your fix and say so. They are not
//     drive times.
//
// Pure module: no IO, no React. The caller hands in map elements.

export type CareKind = "emergency" | "hospital" | "clinic" | "doctor" | "pharmacy" | "dentist";

export const CARE_LAW =
  "Echo shows where care is, from map records. It never calls, never books, and never reads your symptoms.";

export const CARE_SOURCE = "OpenStreetMap records";

export type CareKindRow = { id: CareKind; label: string; plain: string };

/** The kinds a person actually asks for, in the order urgency runs. */
export const CARE_KINDS: CareKindRow[] = [
  { id: "emergency", label: "Emergency room", plain: "Hospitals the map records as taking emergencies." },
  { id: "hospital", label: "Hospital", plain: "Every hospital nearby, emergency room or not." },
  { id: "clinic", label: "Clinic", plain: "Walk-in and day clinics." },
  { id: "doctor", label: "Doctor", plain: "Doctors' practices." },
  { id: "pharmacy", label: "Pharmacy", plain: "Where a prescription gets filled." },
  { id: "dentist", label: "Dentist", plain: "Dental practices." },
];

export function isCareKind(v: unknown): v is CareKind {
  return typeof v === "string" && CARE_KINDS.some((k) => k.id === v);
}

export function careKindLabel(kind: CareKind): string {
  return CARE_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export type CarePlace = {
  /** Stable id from the map element, so the same place is the same row twice. */
  id: string;
  name: string;
  kind: CareKind;
  lat: number;
  lon: number;
  /** Straight-line metres from the fix that was searched. */
  distanceM: number;
  address: string | null;
  phone: string | null;
  /** Opening hours exactly as the map recorded them. Never reworded. */
  hours: string | null;
  /** True only when the map says emergency=yes. Null means the map is silent. */
  emergency: boolean | null;
};

const TAG_FOR: Record<CareKind, string> = {
  emergency: "hospital",
  hospital: "hospital",
  clinic: "clinic",
  doctor: "doctors",
  pharmacy: "pharmacy",
  dentist: "dentist",
};

/** Overpass QL for the kinds asked for. One query, nodes and ways. */
export function careOverpassQL(lat: number, lon: number, radius: number, kinds: CareKind[]): string {
  const amenities = Array.from(new Set((kinds.length ? kinds : ["hospital"]).map((k) => TAG_FOR[k as CareKind])));
  const filter = `[amenity~"^(${amenities.join("|")})$"]`;
  return (
    `[out:json][timeout:12];(` +
    `node(around:${radius},${lat},${lon})${filter};` +
    `way(around:${radius},${lat},${lon})${filter};` +
    `);out tags center 120;`
  );
}

export function haversineM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6_371_000;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function addressOf(tags: Record<string, string>): string | null {
  const line = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:postcode"],
  ]
    .filter((p) => p && String(p).trim())
    .join(", ");
  return line || null;
}

function kindOf(tags: Record<string, string>): CareKind | null {
  const amenity = tags.amenity;
  if (amenity === "hospital") return tags.emergency === "yes" ? "emergency" : "hospital";
  if (amenity === "clinic") return "clinic";
  if (amenity === "doctors") return "doctor";
  if (amenity === "pharmacy") return "pharmacy";
  if (amenity === "dentist") return "dentist";
  return null;
}

/** Map elements in, honest rows out. Unnamed and unplaced elements are dropped. */
export function normalizeCare(elements: unknown[], lat: number, lon: number): CarePlace[] {
  const out: CarePlace[] = [];
  const seen = new Set<string>();
  for (const raw of elements ?? []) {
    const el = raw as Record<string, any>;
    const tags = (el?.tags ?? {}) as Record<string, string>;
    const name = (tags.name ?? "").trim();
    const kind = kindOf(tags);
    if (!name || !kind) continue;
    const plat = Number(el.lat ?? el.center?.lat);
    const plon = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;
    const id = `${el.type ?? "node"}/${el.id ?? `${plat},${plon}`}`;
    const dedupe = `${kind}:${name.toLowerCase()}:${plat.toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      id,
      name,
      kind,
      lat: plat,
      lon: plon,
      distanceM: Math.round(haversineM(lat, lon, plat, plon)),
      address: addressOf(tags),
      phone: (tags.phone ?? tags["contact:phone"] ?? "").trim() || null,
      hours: (tags.opening_hours ?? "").trim() || null,
      emergency: tags.emergency === "yes" ? true : tags.emergency === "no" ? false : null,
    });
  }
  return rankCare(out);
}

const KIND_RANK: Record<CareKind, number> = {
  emergency: 0,
  hospital: 1,
  clinic: 2,
  doctor: 3,
  pharmacy: 4,
  dentist: 5,
};

/** Urgent care first, then nearest. Never price, never rating — there is none. */
export function rankCare(rows: CarePlace[]): CarePlace[] {
  return [...rows].sort((a, b) => {
    const ra = KIND_RANK[a.kind] ?? 9;
    const rb = KIND_RANK[b.kind] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.distanceM - b.distanceM;
  });
}

/** Free-text narrowing over what is already on the list. Never a new lookup. */
export function filterCare(rows: CarePlace[], query: string | null | undefined, kinds: CareKind[] = []): CarePlace[] {
  const q = (query ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (kinds.length && !kinds.includes(r.kind)) return false;
    if (!q) return true;
    return [r.name, r.address ?? "", careKindLabel(r.kind)].join(" ").toLowerCase().includes(q);
  });
}

export function distanceWords(metres: number): string {
  if (!Number.isFinite(metres)) return "distance unknown";
  if (metres < 950) return `${Math.max(50, Math.round(metres / 50) * 50)} m away`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km away`;
}

/** One row, said the way a person reads it. */
export function careWords(p: CarePlace): string {
  const bits = [careKindLabel(p.kind), distanceWords(p.distanceM)];
  if (p.address) bits.push(p.address);
  if (p.phone) bits.push(p.phone);
  if (p.hours) bits.push(`hours as recorded: ${p.hours}`);
  return `${p.name} — ${bits.join(" · ")}`;
}

/** A map link anyone can open. Echo does not route you there. */
export function careMapLink(p: CarePlace): string {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`;
}

/** The whole answer: the number first, then the nearest places. */
export function careAnswer(rows: CarePlace[], helpText: string | null, radiusM: number): string {
  const lines: string[] = [];
  if (helpText) lines.push(helpText);
  if (!rows.length) {
    lines.push(
      `The map has no hospital, clinic or pharmacy recorded within ${Math.round(radiusM / 1000)} km of where Echo has you. That is the map being empty, not care being absent — ask where you are staying.`,
    );
  } else {
    lines.push(`Nearest care the map records (straight-line, not drive time):`);
    for (const p of rows.slice(0, 6)) lines.push(`• ${careWords(p)}`);
  }
  lines.push(CARE_LAW);
  return lines.join("\n");
}

/* ── Where the listings came from ──────────────────────────────────────────
   Two providers, one shape. A row never pretends to be from a source it is
   not, and the panel says which one answered. */

export type CareSource = "google" | "osm";

export const CARE_SOURCE_WORDS: Record<CareSource, string> = {
  google: "Google Maps place records",
  osm: "OpenStreetMap records",
};

export function careSourceWords(source: string | null | undefined): string {
  return CARE_SOURCE_WORDS[(source ?? "osm") as CareSource] ?? CARE_SOURCE;
}

/** The place types to ask Google for, per kind a person tapped. */
const GOOGLE_TYPES: Record<CareKind, string[]> = {
  emergency: ["hospital"],
  hospital: ["hospital"],
  clinic: ["doctor", "medical_lab"],
  doctor: ["doctor"],
  pharmacy: ["pharmacy", "drugstore"],
  dentist: ["dentist", "dental_clinic"],
};

export function googleCareTypes(kinds: CareKind[]): string[] {
  const wanted = kinds.length ? kinds : (CARE_KINDS.map((k) => k.id) as CareKind[]);
  return Array.from(new Set(wanted.flatMap((k) => GOOGLE_TYPES[k] ?? [])));
}

function googleKind(types: string[], name: string): CareKind | null {
  const has = (t: string) => types.includes(t);
  if (has("hospital")) return "hospital";
  if (has("pharmacy") || has("drugstore")) return "pharmacy";
  if (has("dentist") || has("dental_clinic")) return "dentist";
  if (has("doctor") || has("medical_lab")) {
    /* Google has no clinic type. A name that says clinic is the only honest
       reason to call it one. */
    return /\bclinic\b|urgent care|walk-?in/i.test(name) ? "clinic" : "doctor";
  }
  return null;
}

/**
 * Google's Places rows, narrowed to the same honest shape. A field Google did
 * not carry stays blank; nothing here is rated, ranked or invented.
 */
export function normalizeGoogleCare(rows: unknown[], lat: number, lon: number): CarePlace[] {
  const out: CarePlace[] = [];
  const seen = new Set<string>();
  for (const raw of rows ?? []) {
    const p = raw as Record<string, any>;
    const name = String(p?.displayName?.text ?? "").trim();
    const plat = Number(p?.location?.latitude);
    const plon = Number(p?.location?.longitude);
    if (!name || !Number.isFinite(plat) || !Number.isFinite(plon)) continue;
    const types: string[] = Array.isArray(p?.types) ? p.types.map(String) : [];
    if (p?.primaryType) types.unshift(String(p.primaryType));
    const kind = googleKind(types, name);
    if (!kind) continue;
    const id = `google/${String(p?.id ?? `${plat},${plon}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hours: string[] = Array.isArray(p?.regularOpeningHours?.weekdayDescriptions)
      ? p.regularOpeningHours.weekdayDescriptions.map(String)
      : [];
    out.push({
      id,
      name,
      kind,
      lat: plat,
      lon: plon,
      distanceM: Math.round(haversineM(lat, lon, plat, plon)),
      address: String(p?.formattedAddress ?? "").trim() || null,
      phone: String(p?.nationalPhoneNumber ?? p?.internationalPhoneNumber ?? "").trim() || null,
      hours: hours.length ? hours.join("; ") : null,
      /* Google does not say whether a hospital takes emergencies. Silence stays silence. */
      emergency: null,
    });
  }
  return rankCare(out);
}
