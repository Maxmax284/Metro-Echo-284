// journey — one trip, end to end: the legs, the ground between them, and where
// you actually are on it.
//
// Doctrine:
//   - A journey is the object, not a flight. Dulles → Tokyo → Bangkok is one
//     thing with pieces, and the sit in the middle is part of it.
//   - Position is derived, never tracked. Echo knows what the airline filed and
//     when it read it. It never claims to see the aircraft, and every state
//     carries whose word moved it.
//   - The airline moves you along; you can put it back. A person who missed a
//     flight, got bumped, or is still on the tarmac overrules the feed, and the
//     override says so on the card.
//   - Nothing is filled in. No gate, no terminal, no landing time unless the
//     provider carried one. A landing time that has passed with nothing filed
//     since is reported as exactly that, not as landed.
//   - Layover arithmetic is shown, not asserted, so a person can argue with it.
//
// Pure module: no IO, no React.

import { airport, airportWords, bordersCrossed } from "./airports.ts";
import type { FlightOption, FlightPlan } from "./flightPlan.ts";
import type { LiveFlight } from "./flightStatus.ts";

export const JOURNEY_LAW =
  "Echo works out where you are from what the airline filed and when it read it. It does not track you, and the board in the terminal always wins.";

/** Minutes before a departure that boarding realistically takes you. */
export const BOARDING_LEAD_MIN = 40;
/** Minutes to allow when the connection changes terminal. */
export const TERMINAL_CHANGE_MIN = 30;
/** Minutes to allow when the connection crosses a border. */
export const IMMIGRATION_MIN = 45;
/** Usable minutes below which leaving the airport is not worth suggesting. */
export const LEAVE_AIRPORT_MIN = 240;

export type TimeBasis = "actual" | "estimated" | "scheduled" | "recorded" | "none";

export type LegEnd = {
  iata: string;
  at: string | null;
  basis: TimeBasis;
  terminal: string | null;
  gate: string | null;
};

export type LegStateKind = "not_started" | "at_airport" | "in_air" | "landed" | "did_not_happen";

export type Leg = {
  plan_id: string;
  order: number;
  flight_no: string | null;
  airline: string | null;
  from: LegEnd;
  to: LegEnd;
  live_checked_at: string | null;
  /** The airline's own word: scheduled, active, landed, cancelled, diverted. */
  filed_status: string | null;
  override: LegStateKind | null;
  override_note: string | null;
};

export type LegState = {
  kind: LegStateKind;
  /** Whose word this is. */
  source: "you" | "the airline" | "the clock";
  words: string;
  /** True when the filed time has passed and nothing has been filed since. */
  stale: boolean;
};

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function asLive(raw: unknown): LiveFlight | null {
  const r = raw as LiveFlight | null;
  return r && typeof r === "object" && "departure" in r ? r : null;
}

function pickTime(end: { actual?: string | null; estimated?: string | null; scheduled?: string | null } | null): {
  at: string | null;
  basis: TimeBasis;
} {
  if (!end) return { at: null, basis: "none" };
  const actual = str(end.actual);
  if (actual) return { at: actual, basis: "actual" };
  const estimated = str(end.estimated);
  if (estimated) return { at: estimated, basis: "estimated" };
  const scheduled = str(end.scheduled);
  if (scheduled) return { at: scheduled, basis: "scheduled" };
  return { at: null, basis: "none" };
}

function chosenOption(plan: FlightPlan): FlightOption | null {
  if (plan.chosen_option_id) {
    const found = plan.options.find((o) => o.id === plan.chosen_option_id);
    if (found) return found;
  }
  return plan.options[0] ?? null;
}

/** One flight plan read as a leg. The airline's reading wins over what was typed. */
export function legOf(plan: FlightPlan, order = 0): Leg {
  const live = asLive(plan.live_status);
  const option = chosenOption(plan);
  const dep = live ? pickTime(live.departure) : { at: null, basis: "none" as TimeBasis };
  const arr = live ? pickTime(live.arrival) : { at: null, basis: "none" as TimeBasis };
  const fromIata = (live?.departure.iata ?? plan.origin ?? "").toUpperCase();
  const toIata = (live?.arrival.iata ?? plan.destination ?? "").toUpperCase();
  return {
    plan_id: plan.id,
    order,
    flight_no: option?.flight_no ?? live?.flight_no ?? null,
    airline: option?.airline ?? live?.airline ?? null,
    from: {
      iata: fromIata,
      at: dep.at ?? option?.depart_at ?? null,
      basis: dep.at ? dep.basis : option?.depart_at ? "recorded" : "none",
      terminal: live?.departure.terminal ?? null,
      gate: live?.departure.gate ?? null,
    },
    to: {
      iata: toIata,
      at: arr.at ?? option?.arrive_at ?? null,
      basis: arr.at ? arr.basis : option?.arrive_at ? "recorded" : "none",
      terminal: live?.arrival.terminal ?? null,
      gate: live?.arrival.gate ?? null,
    },
    live_checked_at: plan.live_checked_at ?? null,
    filed_status: live?.status ?? null,
    override: (plan.leg_state as LegStateKind | undefined) ?? null,
    override_note: plan.leg_state_note ?? null,
  };
}

const BASIS_WORDS: Record<TimeBasis, string> = {
  actual: "filed by the airline as it happened",
  estimated: "the airline's current estimate",
  scheduled: "the airline's schedule",
  recorded: "what is on your record",
  none: "no time on record",
};

export function basisWords(basis: TimeBasis): string {
  return BASIS_WORDS[basis];
}

/**
 * Where a leg got to. The airline's filing moves it; an override put in by the
 * person beats the airline outright, because a feed does not know you were
 * standing at the wrong gate.
 */
export function legState(leg: Leg, now: Date = new Date()): LegState {
  if (leg.override) {
    return {
      kind: leg.override,
      source: "you",
      words: leg.override_note ?? OVERRIDE_WORDS[leg.override],
      stale: false,
    };
  }
  const filed = leg.filed_status;
  if (filed === "cancelled" || filed === "diverted") {
    return {
      kind: filed === "cancelled" ? "did_not_happen" : "in_air",
      source: "the airline",
      words: filed === "cancelled" ? "The airline filed this one as cancelled." : "The airline filed this one as diverted.",
      stale: false,
    };
  }
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
  const nowMs = now.getTime();

  if (leg.to.basis === "actual") {
    return { kind: "landed", source: "the airline", words: "On the ground — the airline filed the landing.", stale: false };
  }
  if (leg.from.basis === "actual") {
    const due = t(leg.to.at);
    const overdue = Number.isFinite(due) && nowMs > due + 15 * 60_000;
    return {
      kind: "in_air",
      source: "the airline",
      words: overdue
        ? "In the air. The filed landing time has passed and the airline has filed nothing since — that is what the feed says, not that you have landed."
        : "In the air — the airline filed the departure.",
      stale: overdue,
    };
  }
  const dep = t(leg.from.at);
  if (!Number.isFinite(dep)) {
    return { kind: "not_started", source: "the clock", words: "No departure time on record yet.", stale: false };
  }
  if (nowMs >= dep - 3 * 60 * 60_000 && nowMs < dep + 30 * 60_000) {
    return {
      kind: "at_airport",
      source: "the clock",
      words: "Departure is close. The airline has not filed a takeoff yet.",
      stale: false,
    };
  }
  if (nowMs >= dep + 30 * 60_000) {
    return {
      kind: "at_airport",
      source: "the clock",
      words:
        "The departure time has passed and the airline has filed no takeoff. If you are on it, it is waiting; if you missed it, say so.",
      stale: true,
    };
  }
  return { kind: "not_started", source: "the clock", words: "Not started.", stale: false };
}

export const OVERRIDE_WORDS: Record<LegStateKind, string> = {
  not_started: "You put this back to not started.",
  at_airport: "You said you are at the airport for this one.",
  in_air: "You said you are on this one.",
  landed: "You said you are on the ground.",
  did_not_happen: "You said this one did not happen.",
};

export const OVERRIDE_CHOICES: Array<{ value: LegStateKind; label: string; description: string }> = [
  { value: "did_not_happen", label: "I did not make this flight", description: "Missed, bumped, or cancelled on you. The leg stops moving and nothing after it is assumed." },
  { value: "at_airport", label: "Still at the airport", description: "The feed says gone. You are not." },
  { value: "in_air", label: "I am on it", description: "You boarded before the airline filed anything." },
  { value: "landed", label: "I am on the ground", description: "You are down, whatever the feed says." },
];

// ---------------------------------------------------------------------------
// The ground in between
// ---------------------------------------------------------------------------

export type LayoverLine = { line: string; minutes: number | null };

export type Layover = {
  iata: string;
  place: string;
  /** Landing to next departure, on the times on record. Null when either end is missing. */
  gapMin: number | null;
  /** What is taken off the gap, each with its reason. */
  deductions: LayoverLine[];
  /** What is actually yours after the deductions. Null when the gap is unknown. */
  usableMin: number | null;
  terminalChange: "yes" | "no" | "unknown";
  arriveTerminal: string | null;
  departTerminal: string | null;
  border: "same" | "different" | "unknown";
  canLeaveAirport: boolean;
  words: string;
};

export function durationWords(minutes: number | null): string | null {
  if (minutes == null) return null;
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (!h) return `${sign}${m}m`;
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

/** The sit between two legs, with the subtraction shown. */
export function layoverBetween(a: Leg, b: Leg, now: Date = new Date()): Layover {
  const iata = b.from.iata || a.to.iata;
  const land = a.to.at ? new Date(a.to.at).getTime() : NaN;
  const off = b.from.at ? new Date(b.from.at).getTime() : NaN;
  const gapMin =
    Number.isFinite(land) && Number.isFinite(off) && off > land ? Math.round((off - land) / 60_000) : null;

  const arriveTerminal = a.to.terminal;
  const departTerminal = b.from.terminal;
  const terminalChange: Layover["terminalChange"] =
    !arriveTerminal || !departTerminal ? "unknown" : arriveTerminal === departTerminal ? "no" : "yes";
  const border = bordersCrossed(a.from.iata, a.to.iata);

  const deductions: LayoverLine[] = [{ line: `boarding closes before departure`, minutes: BOARDING_LEAD_MIN }];
  if (terminalChange === "yes") {
    deductions.push({ line: `terminal ${arriveTerminal} to terminal ${departTerminal}`, minutes: TERMINAL_CHANGE_MIN });
  } else if (terminalChange === "unknown") {
    deductions.push({ line: "terminals are not on record, so a change is not ruled out", minutes: null });
  }
  if (border === "different") {
    deductions.push({ line: "you are crossing a border on the way in", minutes: IMMIGRATION_MIN });
  } else if (border === "unknown") {
    deductions.push({ line: "whether you clear immigration here is not on record", minutes: null });
  }

  const taken = deductions.reduce((sum, d) => sum + (d.minutes ?? 0), 0);
  const usableMin = gapMin == null ? null : gapMin - taken;
  const place = airportWords(iata);
  const canLeaveAirport = usableMin != null && usableMin >= LEAVE_AIRPORT_MIN;

  const words =
    gapMin == null
      ? `${place} — the sit here cannot be worked out: one of the two times is not on record.`
      : `${place} — ${durationWords(gapMin)} on the clock, ${durationWords(usableMin)} actually yours once ${durationWords(taken)} is taken off.`;

  return {
    iata,
    place,
    gapMin,
    deductions,
    usableMin,
    terminalChange,
    arriveTerminal,
    departTerminal,
    border,
    canLeaveAirport,
    words,
  };
}

/** How much of the sit is left from where the clock is now. */
export function timeLeftHere(a: Leg, b: Leg, now: Date = new Date()): number | null {
  const off = b.from.at ? new Date(b.from.at).getTime() : NaN;
  if (!Number.isFinite(off)) return null;
  return Math.round((off - now.getTime()) / 60_000);
}

// ---------------------------------------------------------------------------
// The journey itself
// ---------------------------------------------------------------------------

export type Segment =
  | { kind: "air"; leg: Leg; state: LegState }
  | { kind: "ground"; layover: Layover; after: Leg; before: Leg };

export type Journey = {
  id: string;
  legs: Leg[];
  segments: Segment[];
  title: string;
};

export type JourneyWhere = {
  kind: "before" | "at_airport" | "in_air" | "on_ground" | "done" | "stopped";
  legIndex: number;
  iata: string | null;
  place: string | null;
  words: string;
  /** The sit you are in, when you are in one. */
  layover: Layover | null;
  nextLeg: Leg | null;
  checked: string | null;
};

/**
 * Legs that belong on your own spine: yours, not dropped, and with a route on
 * record. A draft with no airports is not a trip — it renders as "? → ?" and it
 * is not allowed to stand in front of a real flight.
 */
export function ownLegs(plans: FlightPlan[]): Leg[] {
  const mine = plans.filter(
    (p) =>
      p.status !== "dropped" &&
      (p.ownership == null || p.ownership === "mine" || p.ownership === "mine_too"),
  );
  const legs = mine.map((p) => legOf(p, p.leg_order ?? 0));
  return legs
    .filter((l) => (l.from.at || l.to.at) && l.from.iata && l.to.iata)
    .sort((x, y) => new Date(x.from.at ?? x.to.at ?? 0).getTime() - new Date(y.from.at ?? y.to.at ?? 0).getTime())
    .map((l, i) => ({ ...l, order: i }));
}

/**
 * Legs chain into a journey when the next one leaves from where the last one
 * landed, within a day. Anything else is a separate trip — Echo will not staple
 * two unrelated flights together because they happen to be in the same week.
 */
export function groupJourneys(legs: Leg[], maxGapHours = 24): Journey[] {
  const out: Journey[] = [];
  let run: Leg[] = [];
  const flush = () => {
    if (!run.length) return;
    out.push(makeJourney(run));
    run = [];
  };
  for (const leg of legs) {
    if (!run.length) {
      run = [leg];
      continue;
    }
    const prev = run[run.length - 1];
    const sameAirport = !!prev.to.iata && !!leg.from.iata && prev.to.iata === leg.from.iata;
    const land = prev.to.at ? new Date(prev.to.at).getTime() : NaN;
    const off = leg.from.at ? new Date(leg.from.at).getTime() : NaN;
    const gapH = Number.isFinite(land) && Number.isFinite(off) ? (off - land) / 3_600_000 : Infinity;
    if (sameAirport && gapH >= 0 && gapH <= maxGapHours) run.push(leg);
    else {
      flush();
      run = [leg];
    }
  }
  flush();
  return out;
}

function makeJourney(legs: Leg[], now: Date = new Date()): Journey {
  const segments: Segment[] = [];
  legs.forEach((leg, i) => {
    segments.push({ kind: "air", leg, state: legState(leg, now) });
    const next = legs[i + 1];
    if (next) segments.push({ kind: "ground", layover: layoverBetween(leg, next, now), after: leg, before: next });
  });
  const first = legs[0];
  const last = legs[legs.length - 1];
  const via = legs.slice(0, -1).map((l) => l.to.iata).filter(Boolean);
  const ends = [first?.from.iata || "?", last?.to.iata || "?"];
  const title = via.length ? `${ends[0]} → ${via.join(" → ")} → ${ends[1]}` : `${ends[0]} → ${ends[1]}`;
  return { id: legs.map((l) => l.plan_id).join("+"), legs, segments, title };
}

/**
 * Journeys off your own plans. A trip that is still ahead of you, or one you are
 * on, comes before one that is over or that you said did not happen — a stopped
 * leg from last week must not sit where tomorrow's flight belongs.
 */
export function journeysFrom(plans: FlightPlan[], now: Date = new Date()): Journey[] {
  const all = groupJourneys(ownLegs(plans));
  const rank = (j: Journey): number => {
    const where = whereOnJourney(j, now);
    if (where.kind === "stopped") return 3;
    if (where.kind === "done") return 2;
    const last = j.legs[j.legs.length - 1];
    const end = last?.to.at ? new Date(last.to.at).getTime() : NaN;
    if (Number.isFinite(end) && end < now.getTime() - 6 * 3_600_000) return 2;
    return where.kind === "before" ? 1 : 0;
  };
  return all
    .map((j, i) => ({ j, i, r: rank(j) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.j);
}

/** Where you are on this journey, and whose word says so. */
export function whereOnJourney(journey: Journey, now: Date = new Date()): JourneyWhere {
  const states = journey.legs.map((l) => legState(l, now));
  const checked = journey.legs.map((l) => l.live_checked_at).filter(Boolean).sort().pop() ?? null;

  const stopped = states.findIndex((s) => s.kind === "did_not_happen");
  if (stopped >= 0) {
    const leg = journey.legs[stopped];
    return {
      kind: "stopped",
      legIndex: stopped,
      iata: leg.from.iata || null,
      place: leg.from.iata ? airportWords(leg.from.iata) : null,
      words: `${states[stopped].words} Nothing after it is assumed — the rest of this journey is on hold until you say what happened.`,
      layover: null,
      nextLeg: null,
      checked,
    };
  }

  const flying = states.findIndex((s) => s.kind === "in_air");
  if (flying >= 0) {
    const leg = journey.legs[flying];
    return {
      kind: "in_air",
      legIndex: flying,
      iata: null,
      place: null,
      words: `In the air, ${airportWords(leg.from.iata)} to ${airportWords(leg.to.iata)}. ${states[flying].words}`,
      layover: null,
      nextLeg: journey.legs[flying + 1] ?? null,
      checked,
    };
  }

  const lastLanded = states.reduce((idx, s, i) => (s.kind === "landed" ? i : idx), -1);
  if (lastLanded >= 0) {
    const leg = journey.legs[lastLanded];
    const next = journey.legs[lastLanded + 1];
    if (!next) {
      return {
        kind: "done",
        legIndex: lastLanded,
        iata: leg.to.iata || null,
        place: leg.to.iata ? airportWords(leg.to.iata) : null,
        words: `Landed at ${airportWords(leg.to.iata)}. That was the last leg on record.`,
        layover: null,
        nextLeg: null,
        checked,
      };
    }
    const lay = layoverBetween(leg, next, now);
    const left = timeLeftHere(leg, next, now);
    return {
      kind: "on_ground",
      legIndex: lastLanded,
      iata: lay.iata || null,
      place: lay.place,
      words: `On the ground at ${lay.place}. Next up is ${next.flight_no ?? "the next leg"}${
        left != null ? `, ${durationWords(left)} from now` : ""
      }.`,
      layover: lay,
      nextLeg: next,
      checked,
    };
  }

  const atAirport = states.findIndex((s) => s.kind === "at_airport");
  if (atAirport >= 0) {
    const leg = journey.legs[atAirport];
    return {
      kind: "at_airport",
      legIndex: atAirport,
      iata: leg.from.iata || null,
      place: leg.from.iata ? airportWords(leg.from.iata) : null,
      words: `At ${airportWords(leg.from.iata)} for ${leg.flight_no ?? "your flight"}. ${states[atAirport].words}`,
      layover: null,
      nextLeg: journey.legs[atAirport + 1] ?? null,
      checked,
    };
  }

  const first = journey.legs[0];
  return {
    kind: "before",
    legIndex: 0,
    iata: first?.from.iata || null,
    place: first?.from.iata ? airportWords(first.from.iata) : null,
    /* The rail underneath carries the times, in the reader's own words. A raw
       24-hour stamp here only confused people. */
    words: `Not started. ${journey.title}.`,
    layover: null,
    nextLeg: first ?? null,
    checked,
  };
}

/** The two numbers that matter at three in the morning. */
export function bigNumbers(
  journey: Journey,
  now: Date = new Date(),
): { timeLeft: string | null; timeLeftLabel: string; gate: string | null; gateLabel: string } {
  const where = whereOnJourney(journey, now);
  const next = where.nextLeg;
  const leftMin = next?.from.at ? Math.round((new Date(next.from.at).getTime() - now.getTime()) / 60_000) : null;
  const gate = next?.from.gate ?? null;
  const terminal = next?.from.terminal ?? null;
  return {
    timeLeft: leftMin == null ? null : durationWords(leftMin),
    timeLeftLabel:
      where.kind === "on_ground" ? "left here" : where.kind === "in_air" ? "until you land" : "until you leave",
    gate: gate ?? (terminal ? `T${terminal.replace(/^T/i, "")}` : null),
    gateLabel: gate ? "next gate" : terminal ? "next terminal, gate not filed" : "no gate filed yet",
  };
}

// ---------------------------------------------------------------------------
// Reading it with no bars
// ---------------------------------------------------------------------------

export type OfflinePack = {
  journey_id: string;
  title: string;
  saved_at: string;
  legs: Array<{
    flight_no: string | null;
    from: string;
    to: string;
    depart_at: string | null;
    depart_basis: TimeBasis;
    arrive_at: string | null;
    terminal: string | null;
    gate: string | null;
    state: LegStateKind;
  }>;
  layovers: Array<{ iata: string; gapMin: number | null; usableMin: number | null; terminalChange: string }>;
};

/**
 * The whole journey, written down, so it reads on a phone with no service. Every
 * pack carries when it was saved, because a pack is a memory of a reading, not
 * the current truth.
 */
export function offlinePack(journey: Journey, now: Date = new Date()): OfflinePack {
  return {
    journey_id: journey.id,
    title: journey.title,
    saved_at: now.toISOString(),
    legs: journey.legs.map((l) => ({
      flight_no: l.flight_no,
      from: l.from.iata,
      to: l.to.iata,
      depart_at: l.from.at,
      depart_basis: l.from.basis,
      arrive_at: l.to.at,
      terminal: l.from.terminal,
      gate: l.from.gate,
      state: legState(l, now).kind,
    })),
    layovers: journey.segments
      .filter((s): s is Extract<Segment, { kind: "ground" }> => s.kind === "ground")
      .map((s) => ({
        iata: s.layover.iata,
        gapMin: s.layover.gapMin,
        usableMin: s.layover.usableMin,
        terminalChange: s.layover.terminalChange,
      })),
  };
}

/** What is different since the pack was saved. Empty means no news, which is a valid answer. */
export function packDiff(prev: OfflinePack | null | undefined, next: OfflinePack): string[] {
  if (!prev) return [];
  const news: string[] = [];
  for (const leg of next.legs) {
    const was = prev.legs.find((l) => l.flight_no === leg.flight_no && l.from === leg.from);
    if (!was) continue;
    if (was.gate !== leg.gate && leg.gate) news.push(`${leg.flight_no ?? leg.from} now says gate ${leg.gate}.`);
    if (was.terminal !== leg.terminal && leg.terminal) {
      news.push(`${leg.flight_no ?? leg.from} now says terminal ${leg.terminal}.`);
    }
    if (was.depart_at && leg.depart_at && was.depart_at !== leg.depart_at) {
      const moved = Math.round((new Date(leg.depart_at).getTime() - new Date(was.depart_at).getTime()) / 60_000);
      if (Number.isFinite(moved) && moved !== 0) {
        news.push(
          `${leg.flight_no ?? leg.from} leaves ${Math.abs(moved)} min ${moved > 0 ? "later" : "earlier"}, ${leg.depart_at.slice(11, 16)}.`,
        );
      }
    }
    if (was.state !== leg.state) news.push(`${leg.flight_no ?? leg.from} is now ${STATE_WORDS[leg.state]}.`);
  }
  return news;
}

export const STATE_WORDS: Record<LegStateKind, string> = {
  not_started: "not started",
  at_airport: "at the airport",
  in_air: "in the air",
  landed: "on the ground",
  did_not_happen: "recorded as not flown",
};

/** The line every heads-up ends on. A feed is not a departure board. */
export const TERMINAL_CAVEAT =
  "Double-check the board in the terminal — gates move faster than any feed, and the screen there is the one that counts.";

/** What Echo says when you land somewhere with another leg to go. */
export function arrivalMessage(journey: Journey, now: Date = new Date()): string | null {
  const where = whereOnJourney(journey, now);
  if (where.kind !== "on_ground" || !where.layover || !where.nextLeg) return null;
  const lay = where.layover;
  const next = where.nextLeg;
  const left = timeLeftHere(journey.legs[where.legIndex], next, now);
  const bits = [
    `You are on the ground at ${lay.place}.`,
    left != null ? `${durationWords(left)} until ${next.flight_no ?? "the next leg"} leaves.` : null,
    lay.usableMin != null ? `About ${durationWords(lay.usableMin)} of that is actually yours.` : null,
    next.from.gate
      ? `Gate ${next.from.gate} is what the airline filed.`
      : next.from.terminal
        ? `Terminal ${next.from.terminal} filed, no gate yet.`
        : `No gate filed yet.`,
    lay.terminalChange === "yes" ? `That is a terminal change from ${lay.arriveTerminal}.` : null,
    TERMINAL_CAVEAT,
  ].filter(Boolean);
  return bits.join(" ");
}
