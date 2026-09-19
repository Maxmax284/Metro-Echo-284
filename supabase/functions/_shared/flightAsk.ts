// flightAsk — the one way Echo asks the airline feed a question.
//
// Doctrine:
//   - One provider, read only. Nothing here books, holds or changes anything.
//   - The free plan refuses a date filter outright (403 function_access_restricted).
//     That is a limit, not a crash: ask plainly instead, and let normalising throw
//     away any reading whose day is not the day asked about.
//   - An empty answer is an answer. It is reported as nothing on record, never
//     filled in from the ticket.
import { normalizeAviationstack, type LiveFlight } from "./flightStatus.ts";

/** The provider said this plan cannot ask that question. Not a crash — a limit. */
export class PlanLimited extends Error {}

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

/**
 * One reading for one flight on one day, or null when the feed has nothing that
 * matches that day. Throws only on a genuine provider failure.
 */
export async function askFlight(key: string, flight_no: string, flight_date: string): Promise<LiveFlight | null> {
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
