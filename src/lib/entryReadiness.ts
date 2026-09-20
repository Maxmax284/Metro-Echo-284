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
  /** How many days before arrival the official window opens. */
  opensDaysBefore: number;
  /** When it can and must be filed, in the government's own terms. */
  windowWords: string;
  /** Who must file it. */
  whoWords: string;
  /** Who need not. */
  exceptionWords: string;
  /** What you get back and show at the border. */
  doneWords: string;
  /** What to have in front of you before starting the form. */
  prepWords: string[];
  /** Arrival kiosks or QR codes, said as the last resort they are. */
  kioskWords: string | null;
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
    opensDaysBefore: 2,
    windowWords:
      "File it within 3 days of your arrival date, the arrival day itself counted — so from two days before you land. Do it a day or two early, not at the airport.",
    whoWords: "Every non-Thai national entering Thailand, by air, land or sea — children and infants included.",
    exceptionWords:
      "Not needed for a transit or technical-landing flight where you never pass immigration, and not needed by Thai nationals.",
    doneWords: "You get a QR code by email. Keep it saved offline and show it with your passport if asked.",
    prepWords: [
      "Passport details as printed, and your own email address",
      "Flight number and the real arrival date — check the date if you cross midnight or the date line",
      "Address of your first night in Thailand",
      "Purpose of travel, and the health declaration (countries visited in the last 14 days)",
    ],
    kioskWords:
      "Kiosks exist at Suvarnabhumi, Don Mueang, Phuket, Chiang Mai and Hat Yai — a last resort after landing, not a plan. They do not help you board.",
    scamWords:
      "It costs nothing. Any site charging you for it is an imitation — the only real one belongs to the Immigration Bureau.",
    visaWords: "This is an arrival card, not a visa or a travel authorisation. It does not decide whether you may enter or how long you may stay.",
    sources: [
      { label: "Thailand Immigration Bureau — TDAC guide", url: "https://tdac.immigration.go.th/manual/en/index.html" },
      { label: "Immigration Bureau — TDAC questions", url: "https://tdac.immigration.go.th/manual/en/faq.html" },
    ],
    checkedOn: "2026-09-20",
    nationalWords: ["th", "thai", "thailand"],
  },
  TW: {
    countryCode: "TW",
    country: "Taiwan",
    cardName: "Taiwan Arrival Card (TWAC)",
    officialUrl: "https://twac.immigration.gov.tw",
    free: true,
    opensDaysBefore: 7,
    windowWords:
      "File it within 7 days before you arrive — the window was widened from 3 days in July 2026. Paper cards ended on 1 October 2025.",
    whoWords: "Foreign travellers arriving in Taiwan. It must be done before you reach passport control.",
    exceptionWords:
      "It is for entry. If you never pass immigration on an airside transfer, it is not an entry — ask your airline if your route is unclear.",
    doneWords:
      "A confirmation lands in your email. You do not have to show it: the officer's passport scan pulls up your card.",
    prepWords: [
      "Passport data page — you can photograph it and let the form fill itself",
      "Email address, verified by a code before the form opens",
      "Flight number and arrival date",
      "Address or hotel in Taiwan",
    ],
    kioskWords:
      "QR codes at the airport let you file after landing — a last resort, not a plan, and no help at the boarding gate.",
    scamWords:
      "The National Immigration Agency charges nothing. Any site asking for a fee is an imitation.",
    visaWords: "This is an arrival card, not a visa. Visa or visa-exemption rules are separate.",
    sources: [
      {
        label: "National Immigration Agency — TWAC from 1 Oct 2025",
        url: "https://www.immigration.gov.tw/5475/5478/141457/142068/398041/",
      },
      { label: "NIA — filing window widened to 7 days (Jul 2026)", url: "https://www.immigration.gov.tw/5382/5385/7229/7238/415735" },
    ],
    checkedOn: "2026-09-20",
    nationalWords: ["tw", "taiwan", "taiwanese", "roc"],
  },
  SG: {
    countryCode: "SG",
    country: "Singapore",
    cardName: "SG Arrival Card (SGAC)",
    officialUrl: "https://eservices.ica.gov.sg/sgarrivalcard/",
    free: true,
    opensDaysBefore: 2,
    windowWords:
      "File it within 3 days before you arrive, the arrival day counted — so from two days out. One submission per trip.",
    whoWords:
      "All travellers arriving in Singapore, residents included, with the electronic health declaration in the same form.",
    exceptionWords:
      "Not needed if you transit or transfer without seeking immigration clearance, or if you are a resident coming through the Woodlands or Tuas land checkpoints.",
    doneWords: "ICA emails the card back, with a DE number tied to your passport. Save it offline.",
    prepWords: [
      "Passport details and your email address",
      "Flight number and arrival date",
      "Where you are staying in Singapore",
      "Health declaration — false declarations are an offence under the Infectious Diseases Act",
    ],
    kioskWords: null,
    scamWords:
      "ICA's service is free and has published a list of paid imitation sites. Use only the ICA e-service or the MyICA app.",
    visaWords: "The arrival card is not a visa, and it is not a decision to let you in.",
    sources: [
      { label: "ICA — SG Arrival Card with health declaration", url: "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card" },
      { label: "ICA — advisory on paid SGAC sites", url: "https://www.ica.gov.sg/public-education/public-advisory-on-the-submission-of-sg-arrival-card-%28sgac%29" },
    ],
    checkedOn: "2026-09-20",
    nationalWords: ["sg", "singapore", "singaporean"],
  },
};

/** Practical field wisdom that is true of every one of these forms. Not rules —
    the things that go wrong when you do it in a boarding queue. */
export const STREET_KNOWLEDGE: string[] = [
  "Do it on real internet, not the airport Wi-Fi scramble half an hour before boarding.",
  "Check the arrival date twice if your flight crosses midnight or the date line — the day you land is not always the day you left.",
  "Use the flight number you are actually flying on. A codeshare number on your booking may not be the operating flight.",
  "Have the first night's address and your email ready; those are the fields people stall on.",
  "Save the QR code or confirmation offline — screenshot it. Airport data is not a plan.",
  "Follow the posted signs about photography around immigration halls.",
  "Every one of these is free. If a site asks for money, you are on the wrong site.",
];

export type EntryFix = { problem: string; steps: string[] };

/** Help when the official form misbehaves. Practical steps only — Echo does not
    fill anything in, submit anything, or promise any outcome. */
export const ENTRY_FIXES: EntryFix[] = [
  {
    problem: "A required field is greyed out and won't take anything",
    steps: [
      "Why it is disabled is not knowable from here — it may depend on an earlier answer, or the site may be misbehaving.",
      "Screenshot the screen as it stands.",
      "Go back and re-check earlier answers, especially purpose of travel and transit questions.",
      "Try the official site in another browser, or the government's own app if there is one.",
      "If it still won't budge, ask immigration staff at the airport and use the official correction route. Never put in something false to get past it.",
    ],
  },
  {
    problem: "It errored on submit, or no confirmation email arrived",
    steps: [
      "Check your spam folder and that the email address you typed is right.",
      "Most of these systems let you retrieve or update a submission — do that before filing a second one.",
      "Screenshot any error text and the time.",
      "If nothing arrives, the officer at the checkpoint is the place to raise it. A missing email is not automatically a missing submission.",
    ],
  },
  {
    problem: "I already submitted, with a wrong detail",
    steps: [
      "Use the official update page — flight and trip details can usually be edited.",
      "Name, passport number, date of birth and nationality often cannot be edited; that generally means a fresh submission.",
      "Do not leave a knowingly wrong detail in place, and do not use a paid 'correction' service.",
    ],
  },
  {
    problem: "The accommodation fields were greyed out and it submitted anyway",
    steps: [
      "The website taking your submission is not the same as the declaration being complete — a field it skipped can still be missing at the desk.",
      "Screenshot the confirmation and the greyed-out screen before you leave the internet.",
      "Have the address you will actually be at readable on your phone, in the form it appears on your lease or booking.",
      "Say plainly at the counter that the form would not accept the accommodation details, and ask where to go for assistance. Staff see this.",
      "Do not assume an address immigration holds from an earlier filing counts as this declaration, and do not put in something false to fill the gap.",
    ],
  },
  {
    problem: "I'm already at immigration with nothing filed",
    steps: [
      "Say so at the counter rather than guessing — staff deal with this daily.",
      "Where the country provides arrival kiosks or QR codes, they are the fallback. They do not help with boarding.",
      "File it on the spot if you can, from your own phone, on the official address only.",
    ],
  },
];

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

/** How old a hand-vetted note may get before Echo says so out loud. */
export const GUIDE_STALE_DAYS = 90;

/** The widest filing window Echo keeps, so a flight card knows how far ahead to
    look for an arrival that owes a declaration. */
export const MAX_WINDOW_DAYS = Object.values(ENTRY_GUIDES).reduce(
  (most, guide) => Math.max(most, guide.opensDaysBefore),
  0,
);

/** True when these words have not been re-read against the official pages in a
    while. Echo never pretends its paraphrase is fresher than it is. */
export function guideStale(guide: EntryGuide, now: Date = new Date()): boolean {
  const checked = Date.parse(`${guide.checkedOn}T00:00:00Z`);
  if (!Number.isFinite(checked)) return true;
  return now.getTime() - checked > GUIDE_STALE_DAYS * 86_400_000;
}

export type EntryWindow =
  /** The official window is open — file it now. */
  | { kind: "open"; landsAt: number }
  /** Too early for the government's own system. */
  | { kind: "early"; opensAt: number; landsAt: number }
  /** No arrival time on record, so Echo will not date the window. */
  | { kind: "unknown" };

/** When the official submission window opens, worked out from the arrival
    instant only. No arrival instant, no claim. */
export function entryWindow(args: {
  guide: EntryGuide;
  /** The arrival instant, already anchored at the arrival airport. */
  arriveAt?: string | null;
  now?: Date;
}): EntryWindow {
  const lands = args.arriveAt ? Date.parse(args.arriveAt) : Number.NaN;
  if (!Number.isFinite(lands)) return { kind: "unknown" };
  const opensAt = lands - args.guide.opensDaysBefore * 86_400_000;
  const now = (args.now ?? new Date()).getTime();
  if (now < opensAt) return { kind: "early", opensAt, landsAt: lands };
  return { kind: "open", landsAt: lands };
}


export type EntryRead =
  /** Same country both ends — a domestic leg owes no arrival card. */
  | { kind: "domestic"; countryCode: string }
  /** A domestic hop inside a country whose card is already filed for this entry. */
  | { kind: "already_filed"; countryCode: string; guide: EntryGuide }
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
  /** Country code whose arrival card the traveller already marked filed for
      this entry. A later hop inside that country is not a new entry. */
  filedFor?: string | null;
}): EntryRead {
  const from = airportCountry(args.fromIata);
  const to = airportCountry(args.toIata);
  const filed = (args.filedFor ?? "").trim().toUpperCase() || null;
  if (!from && !to) return { kind: "unknown_route" };
  if (from && to && from === to) {
    const sameGuide = ENTRY_GUIDES[to];
    if (filed === to && sameGuide) return { kind: "already_filed", countryCode: to, guide: sameGuide };
    return { kind: "domestic", countryCode: to };
  }

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
