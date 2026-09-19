// journeyFit — does this new flight belong to the trip already underway?
//
// A number typed on its own is not a leg. Echo knows two things it can reason
// with: where the current journey puts you down, and when. This module says
// plainly what the new flight would mean if it leaves from there — and asks for
// the one fact it cannot know instead of assuming it.
//
// Doctrine:
//   - No airport is ever invented. A route not on record is said to be not on
//     record, and the question that fixes it is offered with the answer Echo
//     would bet on, never pre-applied.
//   - The arithmetic is shown. A gap too long to be an airport sit is called a
//     separate trip, with the number of hours in the sentence.
//   - Nothing here touches the flight you are on. A fit is a proposal.
//
// Pure module: no IO, no React.

import { airportWords } from "./airports.ts";
import { durationWords, type Journey } from "./journey.ts";
import { airportZone, anchorToZone } from "./travelSense.ts";

/** Above this, a gap between two legs is a stay, not a sit. Matches groupJourneys. */
export const CHAIN_HOURS = 24;

export type FitKind = "needs_route" | "chains" | "stay" | "elsewhere";

export type FitPlan = {
  id: string;
  origin: string | null;
  destination: string | null;
  depart_on: string | null;
  /** The departure instant, when any source carried one. */
  depart_at: string | null;
  flight_no: string | null;
};

export type JourneyFit = {
  plan_id: string;
  flight_no: string | null;
  kind: FitKind;
  lead: string;
  detail: string[];
  /** Where the trip underway puts you down — the answer Echo would offer. */
  suggest: { iata: string; place: string; lands_at: string | null } | null;
  gap_hours: number | null;
};

function iata(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(t) ? t : null;
}

/** Whether both ends of this flight are actually on record. */
export function routeOnRecord(plan: FitPlan): boolean {
  return !!iata(plan.origin) && !!iata(plan.destination);
}

function hoursBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

/** The day part of an instant or a date string. */
function day(v: string | null): string | null {
  return v ? v.slice(0, 10) : null;
}

/**
 * What a newly added flight would mean for the journey already on record. Null
 * when there is nothing to reason about: no journey, no landing airport, or the
 * flight is already a leg of it.
 */
export function journeyFit(input: {
  journey: Journey | null;
  plan: FitPlan;
  now?: Date;
}): JourneyFit | null {
  const { journey, plan } = input;
  if (!journey || !journey.legs.length) return null;
  if (journey.legs.some((l) => l.plan_id === plan.id)) return null;

  const last = journey.legs[journey.legs.length - 1];
  const endIata = iata(last.to.iata);
  if (!endIata) return null;
  const endPlace = airportWords(endIata) || endIata;
  const endAt = last.to.at ?? null;
  const suggest = { iata: endIata, place: endPlace, lands_at: endAt };

  const from = iata(plan.origin);
  const to = iata(plan.destination);
  const no = plan.flight_no ?? "this flight";
  /* A ticket time with no zone is the wall clock at the airport it leaves from.
     Anchored there before any arithmetic, or a sit reads hours out. */
  const gap = hoursBetween(endAt, anchorToZone(plan.depart_at, airportZone(from ?? endIata)));

  /* Nothing to work with but a number and a day. Ask the one question. */
  if (!from) {
    const detail = [
      `Your trip lands at ${endPlace}${endAt ? "" : ", on the times on record"}. If ${no} leaves from there, Echo chains it on as the next leg and works out the sit.`,
    ];
    const sameOrNextDay =
      day(endAt) && day(plan.depart_on)
        ? (Date.parse(`${day(plan.depart_on)}T00:00:00Z`) - Date.parse(`${day(endAt)}T00:00:00Z`)) / 86_400_000
        : null;
    if (sameOrNextDay != null && sameOrNextDay >= 0 && sameOrNextDay <= 1) {
      detail.push(
        sameOrNextDay === 0
          ? "It is on the same day you land, so a connection is the likely read — but Echo will not name an airport you did not give it."
          : "It is the day after you land, so this may be an overnight rather than a sit. The times decide that, not the date.",
      );
    }
    detail.push("Nothing on the flight you are on changes either way.");
    return {
      plan_id: plan.id,
      flight_no: plan.flight_no ?? null,
      kind: "needs_route",
      lead: `Echo does not know where ${no} leaves from or lands — the provider carries nothing for it.`,
      detail,
      suggest,
      gap_hours: null,
    };
  }

  if (from !== endIata) {
    return {
      plan_id: plan.id,
      flight_no: plan.flight_no ?? null,
      kind: "elsewhere",
      lead: `${no} leaves from ${airportWords(from) || from}, not ${endPlace}, so it is its own trip.`,
      detail: [
        `This journey ends at ${endPlace}. Getting from there to ${airportWords(from) || from} is not on record, and Echo will not invent it.`,
      ],
      suggest,
      gap_hours: gap,
    };
  }

  /* Same airport. Now the clock decides whether it is a sit or a stay. */
  if (gap == null) {
    return {
      plan_id: plan.id,
      flight_no: plan.flight_no ?? null,
      kind: "chains",
      lead: `${no} leaves from ${endPlace}, where this trip lands, so it joins the same journey as the next leg.`,
      detail: [
        "No departure time is on record yet, so how long the sit is cannot be worked out. It fills in the moment a time arrives.",
      ],
      suggest,
      gap_hours: null,
    };
  }

  if (gap < 0) {
    return {
      plan_id: plan.id,
      flight_no: plan.flight_no ?? null,
      kind: "elsewhere",
      lead: `${no} leaves ${endPlace} before this trip lands there, on the times on record.`,
      detail: [
        "One of the two times is wrong, or this belongs to a different trip. Echo keeps them apart rather than picking.",
        `Landing is filed for ${endPlace}; this one is filed to leave ${durationWords(Math.round(-gap * 60)) ?? "earlier"} before that.`,
      ],
      suggest,
      gap_hours: gap,
    };
  }

  if (gap <= CHAIN_HOURS) {
    return {
      plan_id: plan.id,
      flight_no: plan.flight_no ?? null,
      kind: "chains",
      lead: `${no} joins this trip as the next leg out of ${endPlace}.`,
      detail: [
        `${durationWords(Math.round(gap * 60))} on the clock between landing and this one leaving. Echo takes off boarding, the walk and immigration to say how much of that is really yours.`,
        `${endPlace} becomes a connection instead of a destination, so the city notes fold away until the last leg.`,
      ],
      suggest,
      gap_hours: gap,
    };
  }

  return {
    plan_id: plan.id,
    flight_no: plan.flight_no ?? null,
    kind: "stay",
    lead: `${no} leaves ${endPlace} ${durationWords(Math.round(gap * 60))} after you land — that is a stay, not an airport sit.`,
    detail: [
      `Echo keeps it as its own trip rather than pretending you sit in the terminal for ${durationWords(Math.round(gap * 60))}. ${endPlace} stays a destination, so the trains, money and emergency numbers still apply.`,
      "It waits on your schedule and comes forward when this trip is done.",
    ],
    suggest,
    gap_hours: gap,
  };
}

/** The whole fit as one paragraph, for a chat answer. */
export function fitWords(fit: JourneyFit): string {
  return [fit.lead, ...fit.detail].join(" ");
}
