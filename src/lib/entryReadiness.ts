// entryReadiness — what a traveller owes at the border, said plainly.
//
// Doctrine: Echo is not an immigration oracle. It keeps a short, hand-vetted
// list of official arrival-card systems, says where every fact came from and
// when it was last re-read against the official pages, and for everywhere
// else it points at the country's own immigration site instead of guessing.
// It never collects passport numbers and never fills in or submits a
// government form. The only things it holds are the traveller's own words:
// "I am entering" or "I am only changing planes", and a country of passport —
// a country name, never a document number.

export type EntryIntent = "enter" | "transit";

export type EntryGuideSource = { label: string; url: string };

export type EntryGuide = {
  /** Country code this guide covers, e.g. "TH". */
  countryCode: string;
  /** Country as travellers say it. */
  country: string;
  /** The official system's own name. */
  cardName: string;
  /** The one official address. Anything else that charges money is an imitation. */
  officialUrl: string;
  /** The official system costs nothing. */
  free: boolean;
  /** When it can and must be filed. */
  windowWords: string;
  /** Who must file it. */
  whoWords: string;
  /** Who need not. */
  exceptionWords: string;
  /** What you get back and show at the border. */
  doneWords: string;
  /** The paid-imitation warning. */
  scamWords: string;
  /** An arrival card is not a visa, said out loud. */
  visaWords: string;
  /** Where these words came from. */
  sources: EntryGuideSource[];
  /** The day these words were last re-read against the official pages. */
  checkedOn: string;
  /** Lowercase words that mean a traveller is a national of this country. */
  nationalWords: string[];
};

export const ENTRY_GUIDES: Record<string, EntryGuide> = {
  TH: {
    countryCode: "TH",
    country: "Thailand",
    cardName: "Thailand Digital Arrival Card (TDAC)",
    officialUrl: "https://tdac.immigration.go.th",
    free: true,
    windowWords:
      "File it within 3 days before you arrive — the arrival day itself counts. Landed already without it? There are help points and kiosks at immigration.",
    whoWords: "Every non-Thai national entering Thailand, by air, land or sea.",
    exceptionWords:
      "Not needed if you only change planes and never pass through immigration, or if you enter on a Border Pass.",
    doneWords: "You get a QR code by email. Show it at immigration with your passport.",
    scamWords:
      "It costs nothing. Any site charging you for it is an imitation — the only real one belongs to the Immigration Bureau.",
    visaWords: "This is an arrival card, not a visa. It does not decide how long you may stay.",
    sources: [
      { label: "Thailand Immigration Bureau — TDAC guide", url: "https://tdac.immigration.go.th/manual/en/index.html" },
      { label: "U.S. Embassy in Thailand — entry guidance", url: "https://th.usembassy.gov/traveling-to-thailand/" },
    ],
    checkedOn: "2026-09-20",
    nationalWords: ["th", "thai", "thailand"],
  },
};

/** Hand-kept airport → country. An airport not on this list returns null,
    and the copy then says what is not known instead of guessing. */
export const AIRPORT_COUNTRY: Record<string, string> = {
  IAD: "US", JFK: "US", EWR: "US", LAX: "US", ORD: "US", SFO: "US",
  TPE: "TW", TSA: "TW", KHH: "TW",
  BKK: "TH", DMK: "TH", USM: "TH", CNX: "TH", HKT: "TH", HDY: "TH",
  HKG: "HK", NRT: "JP", HND: "JP", KIX: "JP",
  ICN: "KR", SIN: "SG", LHR: "GB", DXB: "AE", DOH: "QA",
  KUL: "MY", SGN: "VN", HAN: "VN", MNL: "PH",
  AMS: "NL", CDG: "FR", FRA: "DE", SYD: "AU",
};

export function airportCountry(iata: string | null | undefined): string | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (code.length !== 3) return null;
  return AIRPORT_COUNTRY[code] ?? null;
}

export function normalizeNationality(words: string | null | undefined): string {
  return (words ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

export type EntryRead =
  /** Same country both ends — a domestic leg owes no arrival card. */
  | { kind: "domestic"; countryCode: string }
  /** Echo cannot tell which countries are involved, so it says nothing. */
  | { kind: "unknown_route" }
  /** International arrival, but the traveller's intent is not on record. */
  | { kind: "needs_intent"; toCountryCode: string | null; toCountry: string | null; guide: EntryGuide | null }
  /** Changing planes without passing immigration — no arrival card. */
  | { kind: "not_needed_transit"; toCountryCode: string | null; toCountry: string | null }
  /** Entering, and whether the card applies depends on the passport carried. */
  | { kind: "needs_nationality"; toCountryCode: string; toCountry: string; guide: EntryGuide }
  /** The card applies to this traveller. */
  | { kind: "needed"; guide: EntryGuide }
  /** The traveller is a national of the country they are entering. */
  | { kind: "not_needed_national"; guide: EntryGuide }
  /** Country is known but Echo keeps no vetted notes for it — official site only. */
  | { kind: "no_guide"; toCountryCode: string | null; toCountry: string | null };

export function entryRead(args: {
  fromIata?: string | null;
  toIata?: string | null;
  intent?: EntryIntent | null;
  nationality?: string | null;
}): EntryRead {
  const from = airportCountry(args.fromIata);
  const to = airportCountry(args.toIata);
  const toIata = (args.toIata ?? "").trim().toUpperCase();
  if (!from && !to) return { kind: "unknown_route" };
  if (from && to && from === to) return { kind: "domestic", countryCode: to };

  const guide = to ? ENTRY_GUIDES[to] ?? null : null;
  const toCountry = guide?.country ?? null;
  const toCountryCode = to;

  // No vetted notes for the destination: point at the official immigration
  // site and stop. Intent and passport questions would not change the answer,
  // so they are not asked.
  if (!guide) return { kind: "no_guide", toCountryCode, toCountry };

  if (!args.intent) return { kind: "needs_intent", toCountryCode, toCountry, guide };
  if (args.intent === "transit") return { kind: "not_needed_transit", toCountryCode, toCountry };

  const nat = normalizeNationality(args.nationality);
  if (!nat) return { kind: "needs_nationality", toCountryCode: to!, toCountry: guide.country, guide };
  if (guide.nationalWords.includes(nat)) return { kind: "not_needed_national", guide };
  return { kind: "needed", guide };
}
