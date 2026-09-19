// flightAsk — the one way Echo asks the airline feed a question.
//
// Doctrine:
//   - Two feeds, read only. FlightAware AeroAPI is asked first because it reads
//     airline dispatch rather than an aggregator; the older feed is the backup.
//     Nothing here books, holds or changes anything.
//   - A feed that carries nothing is not a broken feed. Echo tries the backup,
//     then reports nothing on record — never a filled-in time from the ticket.
//   - The free plan refuses a date filter outright (403 function_access_restricted).
//     That is a limit, not a crash: ask plainly instead, and let normalising throw
//     away any reading whose day is not the day asked about.
import { normalizeAviationstack, type LiveFlight } from "./flightStatus.ts";
import { askAero, AeroLimited } from "./aeroApi.ts";

/** The provider said this plan cannot ask that question. Not a crash — a limit. */
export class PlanLimited extends Error {}

/** Which feed answered a reading, for the receipt. */
export type FeedName = "aeroapi" | "aviationstack";

export function aeroKey(): string {
  return Deno.env.get("AEROAPI_KEY") ?? Deno.env.get("FLIGHTAWARE_API_KEY") ?? "";
}

function restricted(body: string): boolean {
  return body.includes("function_access_restricted") || body.includes("usage_limit_reached");
}


async function askOnce(key: string, flight_no: string, flight_date: string, withDate: boolean) {
  const url = new URL("https://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", key);
  url.searchParams.set("flight_iata", flight_no);
  if (withDate) url.searchParams.set("flight_date", flight_date);
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) {
    if (restricted(text)) throw new PlanLimited(text);
    throw new Error(`[${res.status}] ${text}`);
  }
  const payload = JSON.parse(text || "{}");
  if (payload?.error) {
    const body = JSON.stringify(payload.error);
    if (restricted(body)) throw new PlanLimited(body);
    throw new Error(`[200] ${body}`);
  }
  return payload;
}

/** The older aggregator, on its own. Kept separate so the chain stays readable. */
async function askStack(key: string, flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  if (!key) return null;
  let payload: unknown;
  try {
    payload = await askOnce(key, flight_no, flight_date, true);
  } catch (e) {
    if (!(e instanceof PlanLimited)) throw e;
    console.error("aviationstack refused the date filter; asking without it");
    payload = await askOnce(key, flight_no, flight_date, false);
  }
  return normalizeAviationstack(payload, { flight_no, flight_date });
}

/**
 * One reading for one flight on one day, or null when neither feed has anything
 * that matches that day. AeroAPI is asked first; the aggregator answers when
 * AeroAPI is unconfigured, refused, blind to the flight, or throws.
 * Throws only when every configured feed failed for a real reason.
 */
export async function askFlight(key: string, flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  const aero = aeroKey();
  if (aero) {
    try {
      const live = await askAero(aero, flight_no, flight_date);
      if (live) return live;
      console.error(`aeroapi carried nothing for ${flight_no} on ${flight_date}; trying the backup feed`);
    } catch (e) {
      if (e instanceof AeroLimited) console.error("aeroapi refused this key; trying the backup feed");
      else console.error("aeroapi call threw; trying the backup feed", e);
      if (!key) throw e instanceof AeroLimited ? new PlanLimited(e.message) : e;
    }
  }
  return await askStack(key, flight_no, flight_date);
}

/** The same chain, with the name of the feed that answered, for a receipt. */
export async function askFlightWithFeed(
  key: string,
  flight_no: string,
  flight_date: string,
): Promise<{ live: LiveFlight | null; feed: FeedName }> {
  const aero = aeroKey();
  if (aero) {
    try {
      const live = await askAero(aero, flight_no, flight_date);
      if (live) return { live, feed: "aeroapi" };
    } catch (e) {
      console.error("aeroapi unavailable; falling back", e);
      if (!key) return { live: null, feed: "aeroapi" };
    }
  }
  return { live: await askStack(key, flight_no, flight_date), feed: "aviationstack" };
}

