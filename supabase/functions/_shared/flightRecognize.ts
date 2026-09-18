// flightRecognize — reading flight information out of something Echo was
// already allowed to read.
//
// Doctrine:
//   - Deterministic. Patterns, not a model: a flight code, a date, times, a
//     route, a booking reference. No AI call, no cost, no invention.
//   - Recognition is never ownership. A booking found in someone else's mail is
//     a question, not a flight of yours. The person answers; Echo remembers the
//     answer against the sender and stops asking cold.
//   - Every claim of relation is an evidence line drawn from something recorded:
//     your name on the booking, your address on the mail, a sender you already
//     answered for, a destination you already have on record, dates that touch
//     your own. No line, no claim.
//   - Anything ambiguous stays unread. A numeric date like 03/10 is two dates in
//     two countries, so it is not read at all.
//
// Pure module: no IO, no React.

export type NoticeSource = "mail" | "telegram" | "calendar" | "pasted" | "document";

export const SOURCE_WORDS: Record<NoticeSource, string> = {
  mail: "a mail Echo read",
  telegram: "a message you forwarded",
  calendar: "an entry on your calendar",
  pasted: "something you pasted",
  document: "a file on record",
};

export type Ownership = "unknown" | "mine" | "mine_too" | "theirs" | "not_mine";

export const OWNERSHIP_CHOICES: Array<{ id: Exclude<Ownership, "unknown">; label: string; plain: string }> = [
  { id: "mine", label: "Mine", plain: "It goes on your board as your flight." },
  { id: "mine_too", label: "I'm on this too", plain: "Yours as well as theirs. It goes on your board." },
  { id: "theirs", label: "Theirs — keep an eye on it", plain: "Kept as someone else's flight, watched, not yours." },
  { id: "not_mine", label: "Not mine", plain: "Dropped. Echo stops asking about bookings like it." },
];

export type RecognizedLeg = {
  /** IATA-shaped code, always upper case. */
  flight_no: string;
  airline: string;
  /** ISO date, or null when nothing unambiguous was on record. */
  depart_on: string | null;
  /** The day it lands, when the evidence plainly said a second day. */
  arrive_on?: string | null;
  /** HH:mm, or null. */
  depart_time: string | null;
  arrive_time: string | null;
  origin: string | null;
  destination: string | null;
  /** The exact line it was read from, kept as evidence. */
  line: string;
};


/** Where a booking was made, when the evidence says it plainly. Provenance
    only — Echo never signs into a booking site and never calls one. */
export type BookingSource = {
  /** The site's own name as written, e.g. "Priceline". */
  site: string | null;
  /** The site's own reference for the trip, kept as written. */
  trip_ref: string | null;
  /** One plain line for the record. */
  words: string;
};

/** A human sentence around the evidence that makes something wait on this
    flight. Kept as words, never turned into a rule on its own. */
export type RecognizedCondition = {
  /** The sentence, as written. */
  words: string;
  /** The phrase that made it read as a condition. */
  because: string;
};

export type Recognition = {
  legs: RecognizedLeg[];
  booking_ref: string | null;
  travellers: string[];
  /** Where it was booked, when the page said so. */
  booking?: BookingSource | null;
  /** One condition sentence around the evidence, when there is one. */
  condition?: RecognizedCondition | null;
  /** Lines that looked like flight information but were not readable. */
  unread: string[];
};

const CODE_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/;
const ISO_DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_RE = new RegExp(
  `\\b(?:(\\d{1,2})\\s+)?(${MONTHS.map((m) => `${m.slice(0, 3)}[a-z]*`).join("|")})\\.?\\s+(?:(\\d{1,2})[a-z]{0,2},?\\s+)?(20\\d{2})?\\b`,
  "i",
);
const TIME_24_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const TIME_12_RE = /\b(1[0-2]|0?[1-9]):([0-5]\d)\s?([ap])\.?m\.?\b/gi;
const ROUTE_RE =
  /\b([A-Z]{3})\s*(?:->|-->|→|—>|–>|-|–|—|to|>)\s*([A-Z]{3})\b/;
const BOOKING_RE =
  /(?:confirmation(?:\s+(?:code|number))?|booking(?:\s+(?:reference|code|number|ref))?|reservation(?:\s+code)?|record locator|pnr)\b[^A-Z0-9]{0,14}([A-Z0-9]{5,7})\b/i;
const TRAVELLER_LABEL_RE =
  /\b(?:passengers?|travell?ers?|traveler|name(?:\s+on\s+ticket)?)\b\s*[:\-–]\s*([^\n,;]{3,60})/gi;
const SURNAME_SLASH_RE = /\b([A-Z][A-Z'’-]{1,20})\/([A-Z][A-Z'’-]{1,20})(?:\s+(?:MR|MRS|MS|MSTR|DR))?\b/g;
const AIRPORT_HINT_RE = /\b(flight|departs?|departure|boarding|gate|terminal|airline|itinerary|e-?ticket)\b/i;

/* A screenshot of a booking site rarely writes "TG 6285". It writes the
   carrier's name and the words "Flight 6285". A small, explicit table turns
   that into the same code — a name that is not on the table stays unread
   rather than being guessed at. */
export const AIRLINE_CODES: Record<string, string> = {
  "thai airways": "TG",
  "thai airways intl": "TG",
  "thai airways international": "TG",
  "eva air": "BR",
  "china airlines": "CI",
  starlux: "JX",
  "japan airlines": "JL",
  "all nippon": "NH",
  ana: "NH",
  "korean air": "KE",
  "asiana airlines": "OZ",
  "singapore airlines": "SQ",
  "cathay pacific": "CX",
  "bangkok airways": "PG",
  "vietnam airlines": "VN",
  "philippine airlines": "PR",
  emirates: "EK",
  "qatar airways": "QR",
  "turkish airlines": "TK",
  lufthansa: "LH",
  "british airways": "BA",
  "air france": "AF",
  klm: "KL",
  "united airlines": "UA",
  "american airlines": "AA",
  "delta air lines": "DL",
  "alaska airlines": "AS",
  "jetblue airways": "B6",
  "air canada": "AC",
  "air india": "AI",
  "china eastern": "MU",
  "china southern": "CZ",
  "hong kong airlines": "HX",
};

/** The carrier code a line names in words, or null. Longest name wins. */
export function airlineCodeFromName(line: string): string | null {
  const hay = line.toLowerCase();
  let best: { name: string; code: string } | null = null;
  for (const [name, code] of Object.entries(AIRLINE_CODES)) {
    if (!hay.includes(name)) continue;
    if (!best || name.length > best.name.length) best = { name, code };
  }
  return best?.code ?? null;
}

/** "Flight 6285", "Flight #6285" — the number without a code in front of it. */
const NAMED_FLIGHT_RE = /\bflight\s*(?:number|no\.?|#)?\s*(\d{2,4})\b/i;
/** An airport written out in full usually carries its code in brackets. */
const PAREN_CODE_RE = /\(([A-Z]{3})\)/g;

function pad(n: number): string {

  return String(n).padStart(2, "0");
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.slice(0, 3) === w);
}

/**
 * One unambiguous date out of a line, or null. Named months only, plus ISO —
 * a slash date is two different days in two different countries.
 */
export function readDate(line: string, fallbackYear?: number): string | null {
  const iso = line.match(ISO_DATE_RE);
  if (iso) {
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${pad(m)}-${pad(d)}`;
  }
  const named = line.match(MONTH_RE);
  if (named) {
    const mi = monthIndex(named[2]);
    const day = Number(named[1] ?? named[3] ?? NaN);
    const year = named[4] ? Number(named[4]) : fallbackYear;
    if (mi >= 0 && Number.isFinite(day) && day >= 1 && day <= 31 && year) {
      return `${year}-${pad(mi + 1)}-${pad(day)}`;
    }
  }
  return null;
}

function readTimes(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(TIME_12_RE)) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "p") h += 12;
    out.push(`${pad(h)}:${m[2]}`);
  }
  if (out.length) return out;
  for (const m of line.matchAll(TIME_24_RE)) out.push(`${pad(Number(m[1]))}:${m[2]}`);
  return out;
}

function cleanName(v: string): string {
  return v
    .replace(/\b(MR|MRS|MS|MSTR|DR|ADT|CHD)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(v: string): string {
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Names the text presents as travelling. Labelled lines and ticket-style SURNAME/FIRST. */
export function readTravellers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(TRAVELLER_LABEL_RE)) {
    const name = cleanName(m[1]);
    if (/^[A-Za-z][A-Za-z'’\-\s]{2,}$/.test(name) && name.split(/\s+/).length >= 2) found.push(titleCase(name));
  }
  for (const m of text.matchAll(SURNAME_SLASH_RE)) {
    found.push(titleCase(`${m[2]} ${m[1]}`));
  }
  const seen = new Set<string>();
  return found.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Flight information out of arbitrary text. A leg needs a flight code and a
 * date; the date may sit on a nearby line, as it does in every airline mail.
 * A code with no date anywhere is handed back unread.
 *
 * A screenshot of a booking page is laid out down the page rather than across a
 * line: the carrier and "Flight 6285" on one line, the airports and their days
 * below it. So the whole text is read for airport codes in brackets, days and
 * times in the order they appear, and a single leg is allowed to take what it
 * is missing from that order. More than one leg and nothing is borrowed —
 * guessing which day belongs to which leg is exactly the kind of confidence
 * this module refuses.
 */
export function recognizeFlights(
  text: string | null | undefined,
  opts: { today?: string } = {},
): Recognition {
  const whole = (text ?? "").replace(/\u00a0/g, " ");
  const fallbackYear = Number((opts.today ?? "").slice(0, 4)) || new Date().getUTCFullYear();
  const lines = whole.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const legs: RecognizedLeg[] = [];
  const unread: string[] = [];
  let carriedDate: string | null = null;
  let carriedRoute: { origin: string; destination: string } | null = null;
  let carriedAirline: string | null = null;
  const seen = new Set<string>();

  /* The page read as a whole, in the order a person reads it. */
  const pageDates: string[] = [];
  const pageTimes: string[] = [];
  const pageCodes: string[] = [];
  for (const line of lines) {
    const d = readDate(line, fallbackYear);
    if (d && !pageDates.includes(d)) pageDates.push(d);
    for (const t of readTimes(line)) pageTimes.push(t);
    for (const m of line.toUpperCase().matchAll(PAREN_CODE_RE)) {
      if (!pageCodes.includes(m[1])) pageCodes.push(m[1]);
    }
  }

  for (const line of lines) {
    const upper = line.toUpperCase();
    const lineDate = readDate(line, fallbackYear);
    if (lineDate) carriedDate = lineDate;
    const route = upper.match(ROUTE_RE);
    if (route) carriedRoute = { origin: route[1], destination: route[2] };
    const named = airlineCodeFromName(line);
    if (named) carriedAirline = named;

    const code = upper.match(CODE_RE);
    /* "Thai Airways Intl Flight 6285" — a carrier in words plus a bare flight
       number is the same claim as a code, and only when both are present. */
    const spelled = code ? null : line.match(NAMED_FLIGHT_RE);
    const spelledCarrier = spelled ? (named ?? carriedAirline) : null;
    if (!code && !(spelled && spelledCarrier)) continue;
    /* A bare code in prose is not a flight. Something on the line has to say
       flight, or the line has to carry a time or a route. */
    const times = readTimes(line);
    if (!times.length && !route && !AIRPORT_HINT_RE.test(line)) continue;

    const airline = code ? code[1] : spelledCarrier!;
    const flight_no = code ? `${code[1]}${code[2]}` : `${spelledCarrier}${spelled![1]}`;
    /* A booking page states the day below the flight, not above it, so the
       page's first day counts as the departure day when nothing came first. */
    const depart_on = lineDate ?? carriedDate ?? pageDates[0] ?? null;
    if (!depart_on) {
      unread.push(line);
      continue;
    }
    const key = `${flight_no}:${depart_on}`;
    if (seen.has(key)) continue;
    seen.add(key);
    legs.push({
      flight_no,
      airline,
      depart_on,
      arrive_on: null,
      depart_time: times[0] ?? null,
      arrive_time: times[1] ?? null,
      origin: route?.[1] ?? carriedRoute?.origin ?? null,
      destination: route?.[2] ?? carriedRoute?.destination ?? null,
      line,
    });
  }

  /* One leg, one page: what the leg is missing may be taken from the order the
     page itself set out. Never with two or more legs. */
  if (legs.length === 1) {
    const leg = legs[0];
    if (!leg.origin && !leg.destination && pageCodes.length >= 2) {
      leg.origin = pageCodes[0];
      leg.destination = pageCodes[1];
    }
    if (!leg.depart_time && pageTimes[0]) leg.depart_time = pageTimes[0];
    if (!leg.arrive_time && pageTimes[1]) leg.arrive_time = pageTimes[1];
    const later = pageDates.find((d) => d > leg.depart_on!);
    if (later) leg.arrive_on = later;
  }

  const ref = whole.match(BOOKING_RE);
  return {
    legs,
    booking_ref: ref ? ref[1].toUpperCase() : null,
    travellers: readTravellers(whole),
    booking: readBookingSource(whole),
    condition: readCondition(whole),
    unread,
  };
}

/* Booking sites Echo can name from a screenshot. Naming one is provenance, not
   a connection: nothing here is ever called, signed into, or trusted for a
   status. A site that is not on this table stays unnamed rather than guessed. */
export const BOOKING_SITES: Record<string, string> = {
  priceline: "Priceline",
  expedia: "Expedia",
  orbitz: "Orbitz",
  travelocity: "Travelocity",
  kayak: "Kayak",
  "booking.com": "Booking.com",
  agoda: "Agoda",
  "trip.com": "Trip.com",
  kiwi: "Kiwi.com",
  "google flights": "Google Flights",
  "chase travel": "Chase Travel",
  "capital one travel": "Capital One Travel",
  gotogate: "Gotogate",
  edreams: "eDreams",
};

const TRIP_REF_RE =
  /\b(?:trip|itinerary|order)\s*(?:number|no\.?|#|id)?\s*[:#\-–]?\s*([0-9]{8,18})\b/i;

/**
 * Where it was booked, read off the page. Either half can be missing: a trip
 * number with no site still records, and a site with no number still records.
 */
export function readBookingSource(text: string | null | undefined): BookingSource | null {
  const whole = (text ?? "").replace(/\r/g, "");
  if (!whole.trim()) return null;
  const low = whole.toLowerCase();
  let site: string | null = null;
  for (const [needle, name] of Object.entries(BOOKING_SITES)) {
    if (low.includes(needle)) {
      site = name;
      break;
    }
  }
  const trip = whole.match(TRIP_REF_RE);
  const trip_ref = trip ? trip[1] : null;
  if (!site && !trip_ref) return null;
  const words = site
    ? trip_ref
      ? `Booked through ${site} — trip ${trip_ref}.`
      : `Booked through ${site}.`
    : `Booking site trip number ${trip_ref}.`;
  return { site, trip_ref, words };
}

const CONDITION_RE =
  /\b(only (?:after|once|when)|after (?:we|you|I) know|wait (?:until|for|till)|don'?t book (?:until|unless)|do not book (?:until|unless)|before (?:we|you|I) book|hold off (?:until|till))\b/i;

/**
 * One sentence around the evidence that makes something wait on this flight.
 * Read as words only. It becomes a promise when the person says so — never
 * from the reading alone.
 */
export function readCondition(text: string | null | undefined): RecognizedCondition | null {
  const whole = (text ?? "").replace(/\s+/g, " ").trim();
  if (!whole) return null;
  const sentences = whole.split(/(?<=[.!?])\s+/);
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length < 12 || s.length > 300) continue;
    const hit = s.match(CONDITION_RE);
    if (!hit) continue;
    /* It has to be waiting on something travel-shaped, or it is just talk. */
    if (!/\b(flight|arriv|land|delay|connection|on[- ]time|depart)/i.test(s)) continue;
    return { words: s, because: hit[1].toLowerCase() };
  }
  return null;
}

/** Does this text read like travel evidence at all? Cheap, before any cost. */
export function looksLikeTravel(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t) return false;
  const travelWords = /\b(flight|airline|airways|boarding|departs?|departure|arrives?|arrival|terminal|gate|itinerary|e-?ticket|confirmation code|booking reference|airport)\b/;
  if (!travelWords.test(t)) return false;
  /* Two independent hints, so "I'll take a flight sometime" is not evidence. */
  const second = /\b(airport|airways|airline|terminal|gate|confirmation|booking|itinerary|e-?ticket|\([A-Z]{3}\))\b/i.test(text ?? "")
    || /\b\d{1,2}:\d{2}\b/.test(t)
    || !!airlineCodeFromName(t);
  return second;
}


export type Me = { name?: string | null; emails?: string[] | null };

export type RelationInput = {
  recognition: Recognition;
  text?: string | null;
  me: Me;
  sender?: { name?: string | null; email?: string | null } | null;
  /** What this person already answered for this sender, if anything. */
  knownSender?: { ownership: Exclude<Ownership, "unknown">; name?: string | null } | null;
  /** Place names already on record for this person (cities, airport codes). */
  myPlaces?: string[];
  /** Date windows already on this person's board, as ISO dates. */
  myWindows?: Array<{ start: string; end: string }>;
};

export type Relation = {
  /** Evidence lines, each one drawn from something recorded. */
  lines: string[];
  confidence: "recorded" | "likely" | "unclear";
  /** What Echo would file it as, before the person answers. */
  suggested: Ownership;
};

function nameMatches(a: string, b: string): boolean {
  const parts = (v: string) => v.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((p) => p.length > 1);
  const x = parts(a);
  const y = parts(b);
  if (!x.length || !y.length) return false;
  const overlap = x.filter((p) => y.includes(p));
  return overlap.length >= Math.min(2, Math.min(x.length, y.length));
}

/** Why Echo thinks this booking might concern you. Recorded facts only. */
export function relationEvidence(input: RelationInput): Relation {
  const lines: string[] = [];
  const { recognition, me } = input;
  const text = (input.text ?? "").toLowerCase();
  const myName = (me.name ?? "").trim();
  const emails = (me.emails ?? []).map((e) => e.toLowerCase()).filter(Boolean);

  const onTicket = myName ? recognition.travellers.some((t) => nameMatches(t, myName)) : false;
  if (onTicket) lines.push("Your name is on the booking.");

  const addressed = emails.find((e) => text.includes(e)) ?? null;
  if (addressed) lines.push("Your address is on the booking.");

  if (input.knownSender) {
    const who = input.knownSender.name ?? input.sender?.name ?? "This sender";
    const word =
      input.knownSender.ownership === "mine"
        ? "have been yours before"
        : input.knownSender.ownership === "mine_too"
          ? "have had you on them before"
          : input.knownSender.ownership === "theirs"
            ? "have been theirs before"
            : "were not yours before";
    lines.push(`${who}'s flights ${word}.`);
  } else if (input.sender?.name || input.sender?.email) {
    lines.push(`Sent by ${input.sender.name ?? input.sender.email}, who you have not answered for yet.`);
  }

  const places = (input.myPlaces ?? []).map((p) => p.toLowerCase()).filter(Boolean);
  const dest = recognition.legs.map((l) => l.destination).filter(Boolean) as string[];
  const placeHit = dest.find((d) => places.some((p) => p === d.toLowerCase() || p.includes(d.toLowerCase())));
  if (placeHit) lines.push(`${placeHit} is somewhere you already have on record.`);

  const windows = input.myWindows ?? [];
  const dateHit = recognition.legs
    .map((l) => l.depart_on)
    .filter(Boolean)
    .find((d) => windows.some((w) => (d as string) >= w.start && (d as string) <= w.end));
  if (dateHit) lines.push(`${dateHit} falls inside something already on your board.`);

  let suggested: Ownership = "unknown";
  let confidence: Relation["confidence"] = "unclear";
  if (onTicket || addressed) {
    suggested = "mine";
    confidence = "recorded";
  } else if (input.knownSender) {
    suggested = input.knownSender.ownership;
    confidence = "recorded";
  } else if (placeHit || dateHit) {
    confidence = "likely";
  }
  return { lines, confidence, suggested };
}

function legWords(leg: RecognizedLeg): string {
  const route = leg.origin && leg.destination ? `${leg.origin} → ${leg.destination}` : "route not recorded";
  const when = leg.depart_time ? `${leg.depart_on} at ${leg.depart_time}` : leg.depart_on;
  return `${leg.flight_no}, ${route}, ${when}`;
}

/** The one question Echo asks, once, about a booking it did not expect. */
export function ownershipQuestion(
  recognition: Recognition,
  source: NoticeSource,
  sender?: { name?: string | null; email?: string | null } | null,
): string {
  const who = sender?.name ?? sender?.email ?? null;
  const head = who ? `${who} sent flight details` : `Flight details turned up in ${SOURCE_WORDS[source]}`;
  const what = recognition.legs.map(legWords).join("; ");
  const names = recognition.travellers.length
    ? ` The booking is in the name of ${recognition.travellers.join(" and ")}.`
    : "";
  return `${head} — ${what}.${names} Does this flight have anything to do with you?`;
}

/** What answering does, said before the tap. */
export function ownershipOutcome(answer: Exclude<Ownership, "unknown">): string {
  const choice = OWNERSHIP_CHOICES.find((c) => c.id === answer);
  return choice ? choice.plain : "Recorded.";
}
