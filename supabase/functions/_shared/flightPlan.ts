// flightPlan — Echo prepares a flight, you confirm it.
//
// Doctrine:
//   - Echo never buys. Preparing is arranging what is known — route, dates,
//     times, prices — into one thing you can say yes to. Confirming records the
//     flight on your board. No ticket is purchased, no seat is held, nobody is
//     checked in.
//   - Every price and time has a stated origin: you typed it, or you pasted a
//     quote. There is no live fare feed here, so Echo never presents a number as
//     today's market price.
//   - A prepared plan is a draft with a fate: confirm it, or drop it. It never
//     becomes real on its own.
//   - Nothing is guessed. A missing arrival time stays missing.
//
// Pure module: no IO, no React.

import type { FlightIdentity } from "./flightIdentity.ts";

export const FLIGHT_LAW =
  "Echo prepares and records. It never buys a ticket, holds a seat, or checks you in — confirming puts the flight on your board.";

export type FlightSource = "entered" | "pasted";

export const SOURCE_WORDS: Record<FlightSource, string> = {
  entered: "manually entered",
  pasted: "read from a quote you pasted",
};

export type FlightOption = {
  id: string;
  airline: string | null;
  flight_no: string | null;
  /**
   * Who flies it, what the ticket calls it, every number it answers to, and
   * where to check in. Every field optional: a flight with only a ticket number
   * keeps only a ticket number.
   */
  identity?: FlightIdentity | null;
  /** ISO instant, or null when nothing on record carried a departure time. */
  depart_at: string | null;
  /** ISO instant, or null when the quote did not carry one. */
  arrive_at: string | null;
  price: number | null;
  currency: string | null;
  stops: number | null;
  note: string | null;
  /** A time the traveller read off their own ticket, when the feed carried none. */
  said_time?: { kind: "departure" | "boarding"; hhmm: string; by: string; at: string } | null;
};

export type FlightPlanStatus = "prepared" | "confirmed" | "dropped";

/** Where the plan came from: made at the desk, or noticed in something readable. */
export type FlightOriginKind = "desk" | "recognised";

/** Whose flight this is. Unknown until the person says. */
export type FlightOwnership = "unknown" | "mine" | "mine_too" | "theirs" | "not_mine";

export type NoticedFrom = {
  source: string;
  source_words?: string | null;
  sender?: { name?: string | null; email?: string | null } | null;
  link?: string | null;
  origin_ref?: { kind: string; id: string } | null;
  evidence?: string[];
  confidence?: "recorded" | "likely" | "unclear";
  line?: string | null;
  noticed_at?: string | null;
  /** Every later source that contributed, in the order it arrived. Appended,
      never replaced — a flight can always say which source filled which fact. */
  sources?: Array<{
    source: string;
    source_words?: string | null;
    origin_ref?: { kind: string; id: string } | null;
    filled?: string[];
    line?: string | null;
    at?: string | null;
  }>;
  /** Where the booking was made, when a page said so. Provenance only: Echo
      never calls a booking site and never takes a status from one. */
  booking?: { site: string | null; trip_ref: string | null; words: string } | null;
  /** Disagreements between a later source and what is already on record.
      Nothing is written from these — each one waits on the person. */
  conflicts?: Array<{
    key: string;
    filed: string;
    seen: string;
    words: string;
    source_words?: string | null;
    at: string;
  }>;
  /** A sentence around the evidence that makes something wait on this flight.
      Words until the person turns it into a promise. */
  condition?: { words: string; because: string; at: string; kept_at?: string | null } | null;
  /** Operational facts the traveler verified at the airport. Kept separately
      from provider readings so neither source impersonates the other. */
  local_verification?: {
    gate?: string | null;
    boarding_time?: string | null;
    /** Off the pass in the traveller's hand. Never read from a provider feed. */
    seat?: string | null;
    zone?: string | null;
    baggage_status?: "through_checked" | "collect_here" | "unknown" | null;
    transfer_route?: "airside_transfer" | "enter_country" | "unknown" | null;
    source: "boarding_pass" | "departures_board" | "airline_staff" | "traveler";
    verified_at: string;
  } | null;
};

export type FlightPlan = {
  id: string;
  origin: string;
  destination: string;
  depart_on: string;
  return_on: string | null;
  passengers: number;
  currency: string | null;
  source: FlightSource;
  options: FlightOption[];
  chosen_option_id: string | null;
  status: FlightPlanStatus;
  event_ids: string[];
  created_at?: string;
  confirmed_at?: string | null;
  origin_kind?: FlightOriginKind;
  ownership?: FlightOwnership;
  traveller_name?: string | null;
  booking_ref?: string | null;
  noticed_from?: NoticedFrom | null;
  live_status?: unknown;
  live_checked_at?: string | null;
  /** The journey this leg belongs to, when it chains with others. */
  journey_id?: string | null;
  leg_order?: number | null;
  /** Where the leg got to, when the person overruled the airline. */
  leg_state?: string | null;
  leg_state_source?: string | null;
  leg_state_at?: string | null;
  leg_state_note?: string | null;
};

/** An airport code or a place name, cleaned but never invented. */
export function cleanPlace(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return /^[a-z]{3}$/i.test(t) ? t.toUpperCase() : t;
}

export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 <= t1) return null;
  return Math.round((t2 - t1) / 60_000);
}

export function durationWords(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function optionDuration(o: FlightOption): number | null {
  return minutesBetween(o.depart_at, o.arrive_at);
}

export function priceWords(o: FlightOption): string | null {
  if (o.price == null || !Number.isFinite(o.price)) return null;
  const cur = (o.currency ?? "").toUpperCase();
  const amount = o.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return cur ? `${amount} ${cur}` : amount;
}

/** HH:mm in UTC unless the caller hands in its own formatter. */
function defaultClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * How to name a flight once. "TG TG6285" is a code stuttering into its own
 * number; the number already carries the code, so the code is dropped.
 */
export function whoWords(o: { airline?: string | null; flight_no?: string | null }): string {
  const code = (o.airline ?? "").trim();
  const no = (o.flight_no ?? "").trim();
  if (no && code && no.toUpperCase().startsWith(code.toUpperCase())) return no;
  return [code, no].filter(Boolean).join(" ");
}

export function optionWords(o: FlightOption, clock: (iso: string) => string = defaultClock): string {
  const who = whoWords(o) || "Flight";
  /* No departure time on record stays no departure time. Midnight is not a
     stand-in for something nobody wrote down. */
  const when = !o.depart_at
    ? "no times recorded yet"
    : o.arrive_at
      ? `${clock(o.depart_at)} → ${clock(o.arrive_at)}`
      : `${clock(o.depart_at)}, arrival not recorded`;
  const bits = [when];
  const dur = durationWords(optionDuration(o));
  if (dur) bits.push(dur);
  if (o.stops != null) bits.push(o.stops === 0 ? "non-stop" : `${o.stops} ${o.stops === 1 ? "stop" : "stops"}`);
  const p = priceWords(o);
  if (p) bits.push(p);
  if (o.note) bits.push(o.note);
  return `${who} — ${bits.join(" · ")}`;
}

export function sortOptions(options: FlightOption[]): FlightOption[] {
  /* Timeless options sit last: they are waiting on a time, not competing on one. */
  const at = (o: FlightOption) => (o.depart_at ? new Date(o.depart_at).getTime() : Infinity);
  return [...options].sort((a, b) => at(a) - at(b));
}

/**
 * Cheapest of the options that actually carry a price. Null when none do — and
 * null when the prices are in different currencies, because 200 EUR against 300
 * USD is not arithmetic Echo is allowed to perform without a rate.
 */
export function cheapest(options: FlightOption[]): FlightOption | null {
  const priced = options.filter((o) => o.price != null && Number.isFinite(o.price));
  if (!priced.length) return null;
  const currencies = new Set(priced.map((o) => o.currency ?? ""));
  if (currencies.size > 1) return null;
  return priced.reduce((best, o) => ((o.price as number) < (best.price as number) ? o : best));
}

/** Shortest of the options that carry both ends. Null when none do. */
export function fastest(options: FlightOption[]): FlightOption | null {
  const timed = options.filter((o) => optionDuration(o) != null);
  if (!timed.length) return null;
  return timed.reduce((best, o) => ((optionDuration(o) as number) < (optionDuration(best) as number) ? o : best));
}

export function planTitle(plan: FlightPlan): string {
  const from = cleanPlace(plan.origin);
  const to = cleanPlace(plan.destination);
  /* A booking read out of a mail does not always carry both ends. The flight
     code is what is known, so that is what the title says. */
  const route =
    from && to
      ? `${from} → ${to}`
      : from || to
        ? `${from || to}, other end not recorded`
        : plan.options[0]?.flight_no
          ? `${plan.options[0].flight_no}, route not recorded`
          : "Route not recorded";
  return plan.return_on ? `${route}, ${plan.depart_on} and back ${plan.return_on}` : `${route}, ${plan.depart_on}`;
}

/** What the plan is, before anyone says yes. */
export function planWords(plan: FlightPlan, clock?: (iso: string) => string): string {
  const head = `${planTitle(plan)} · ${plan.passengers} ${plan.passengers === 1 ? "traveller" : "travellers"}`;
  if (plan.status === "confirmed") {
    const chosen = plan.options.find((o) => o.id === plan.chosen_option_id);
    return chosen
      ? `${head} — confirmed: ${optionWords(chosen, clock)}. Recorded on your board, not bought.`
      : `${head} — confirmed, but no option is recorded against it.`;
  }
  if (plan.status === "dropped") return `${head} — dropped. Nothing was booked.`;
  if (!plan.options.length) return `${head} — prepared, with no times on it yet.`;
  const cheap = cheapest(plan.options);
  const fast = fastest(plan.options);
  const notes: string[] = [`${plan.options.length} ${plan.options.length === 1 ? "option" : "options"}`];
  if (cheap) notes.push(`cheapest ${priceWords(cheap)}`);
  if (fast && fast.id !== cheap?.id) notes.push(`fastest ${durationWords(optionDuration(fast))}`);
  return `${head} — ${notes.join(", ")}. ${SOURCE_WORDS[plan.source]}. Waiting on your yes.`;
}

/** Provenance that matches the facts actually present on this specific record. */
export function planSourceWords(plan: FlightPlan): string {
  if (plan.origin_kind === "recognised") {
    const source = plan.noticed_from?.source_words?.trim();
    return source ? `Read from ${source}.` : "Read from a message on record.";
  }
  const said = plan.options.find((option) => option.said_time && option.depart_at)?.said_time ?? null;
  if (said) {
    return said.kind === "boarding"
      ? `Boarding time ${said.hhmm} from your ticket; the airline has not filed a take-off time.`
      : `Departure ${said.hhmm} read off your own ticket.`;
  }
  const hasDeparture = plan.options.some((option) => !!option.depart_at);

  const hasPrice = plan.options.some((option) => option.price != null && Number.isFinite(option.price));
  if (plan.source === "pasted") {
    if (!hasDeparture) return "Added from pasted details; departure time still needed.";
    return hasPrice ? "Times and price read from details you pasted." : "Times read from details you pasted; no price recorded.";
  }
  if (!hasDeparture) return "Added by flight number; departure time still needed.";
  return hasPrice ? "Manually entered times and price." : "Manually entered; no price recorded.";
}

/** Whether this plan may be confirmed, and the honest reason when it may not. */
export function canConfirm(plan: FlightPlan, optionId: string | null): { ok: boolean; reason?: string } {
  if (plan.status === "confirmed") return { ok: false, reason: "This flight is already confirmed." };
  if (plan.status === "dropped") return { ok: false, reason: "This plan was dropped." };
  if (!plan.options.length) return { ok: false, reason: "There is nothing to confirm until an option carries a time." };
  const chosen = plan.options.find((o) => o.id === optionId);
  if (!chosen) return { ok: false, reason: "Pick which flight you mean first." };
  if (!chosen.depart_at) {
    return { ok: false, reason: "No departure time is on record for this one yet, so there is nothing to put on a day." };
  }
  if (!Number.isFinite(new Date(chosen.depart_at).getTime())) {
    return { ok: false, reason: "That option has no real departure time." };
  }
  return { ok: true };
}

/** The board entries a confirmation writes. Departure always; arrival only if recorded. */
export function confirmedEntries(
  plan: FlightPlan,
  option: FlightOption,
): Array<{ title: string; starts_at: string; ends_at: string | null; location: string | null; description: string }> {
  const who = whoWords(option);
  const from = cleanPlace(plan.origin);
  const to = cleanPlace(plan.destination);
  const priced = priceWords(option);
  const description = [
    `Flight prepared in Metro Echo and confirmed by you.`,
    who ? `Carrier: ${who}.` : "",
    priced ? `Price recorded: ${priced} (${SOURCE_WORDS[plan.source]}).` : `No price was recorded.`,
    FLIGHT_LAW,
  ]
    .filter(Boolean)
    .join(" ");
  /* No departure time, no board entry. A day cannot hold an hour nobody recorded. */
  if (!option.depart_at) return [];
  const rows = [
    {
      title: `Depart ${from} → ${to}${who ? ` · ${who}` : ""}`,
      starts_at: option.depart_at,
      ends_at: option.arrive_at,
      location: from || null,
      description,
    },
  ];
  if (option.arrive_at) {
    rows.push({
      title: `Land ${to}${who ? ` · ${who}` : ""}`,
      starts_at: option.arrive_at,
      ends_at: null,
      location: to || null,
      description,
    });
  }
  return rows;
}

const CODE_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
/* A price is only a price when the line says so: a symbol or a currency code.
   A bare number on a flight line is a time, a seat count or a stop count far
   more often than it is money, so Echo will not read it as one. */
const PRICE_RE =
  /(?:([$€£])\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(USD|EUR|GBP|THB|SGD|AUD|CAD|JPY)\b)/i;
const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

/**
 * A pasted quote, read conservatively. One line becomes an option only when it
 * carries a flight code and a departure time. Anything else is handed back as
 * unread rather than guessed at.
 */
export function parseQuote(
  text: string | null | undefined,
  departOn: string,
  fallbackCurrency: string | null = null,
): { options: FlightOption[]; unread: string[] } {
  const options: FlightOption[] = [];
  const unread: string[] = [];
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const code = line.toUpperCase().match(CODE_RE);
    const times = [...line.matchAll(TIME_RE)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
    if (!code || times.length === 0) {
      unread.push(line);
      continue;
    }
    const priceMatch = line.replace(CODE_RE, "").match(PRICE_RE);
    let price: number | null = null;
    let currency: string | null = fallbackCurrency;
    if (priceMatch) {
      const symbol = priceMatch[1] ?? null;
      const rawText = priceMatch[2] ?? priceMatch[3] ?? "";
      const code = priceMatch[4] ?? null;
      const raw = Number(rawText.replace(/,/g, ""));
      if (Number.isFinite(raw) && raw > 0) {
        price = raw;
        currency = (code ?? (symbol ? SYMBOL_CURRENCY[symbol] : null) ?? fallbackCurrency ?? null) as string | null;
        if (currency) currency = currency.toUpperCase();
      }
    }
    const stopsMatch = line.match(/\b(non-?stop|direct)\b/i)
      ? 0
      : line.match(/\b(\d)\s?stops?\b/i)
        ? Number(line.match(/\b(\d)\s?stops?\b/i)![1])
        : null;
    const depart_at = `${departOn}T${times[0]}:00`;
    const arriveTime = times[1] ?? null;
    let arrive_at: string | null = null;
    if (arriveTime) {
      arrive_at = `${departOn}T${arriveTime}:00`;
      /* An arrival earlier in the clock than departure is the next day, which is
         a fact of flying, not an error. */
      if (new Date(arrive_at).getTime() <= new Date(depart_at).getTime()) {
        const next = new Date(`${departOn}T00:00:00`);
        next.setDate(next.getDate() + 1);
        arrive_at = `${next.toISOString().slice(0, 10)}T${arriveTime}:00`;
      }
    }
    options.push({
      id: `${code[1]}${code[2]}-${times[0]}`,
      airline: code[1],
      flight_no: `${code[1]}${code[2]}`,
      depart_at,
      arrive_at,
      price,
      currency: price != null ? currency : null,
      stops: stopsMatch,
      note: null,
    });
  }
  return { options, unread };
}
