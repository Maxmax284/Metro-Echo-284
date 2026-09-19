// flightProvider — one paid reading from the flight-data provider, counted.
//
// Doctrine:
//   - Every reading is logged before it is used, so the day's ledger is honest
//     and the ceiling cannot be walked past.
//   - A provider that carries nothing returns nothing. Silence is never dressed
//     up as "on time".
//   - Read only. There is no arm here that buys, holds or checks anyone in.
import { normalizeAviationstack, type LiveFlight } from "./flightStatus.ts";

/** The day's ceiling on paid readings, across every feature. */
export const DAILY_READING_CEILING = Number(Deno.env.get("FLIGHT_DAILY_BUDGET") ?? "40");

const KEY = Deno.env.get("AVIATIONSTACK_API_KEY") ?? Deno.env.get("FLIGHT_API_KEY") ?? "";

export function providerConfigured(): boolean {
  return !!KEY;
}

/** One provider call. Null when it failed or carried nothing — both are logged. */
export async function readFlight(flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  if (!KEY) return null;

  const ask = async (withDate: boolean): Promise<{ payload?: unknown; limited?: boolean }> => {
    const url = new URL("https://api.aviationstack.com/v1/flights");
    url.searchParams.set("access_key", KEY);
    url.searchParams.set("flight_iata", flight_no);
    if (withDate) url.searchParams.set("flight_date", flight_date);
    const res = await fetch(url.toString());
    const text = await res.text();
    const limited = text.includes("function_access_restricted") || text.includes("usage_limit_reached");
    if (!res.ok) {
      console.error(`aviationstack failed [${res.status}]: ${text}`);
      return { limited };
    }
    const payload = JSON.parse(text || "{}");
    if (payload?.error) {
      console.error("aviationstack error body", JSON.stringify(payload.error));
      return { limited };
    }
    return { payload };
  };

  try {
    let out = await ask(true);
    // The free plan refuses a date filter. Ask plainly; normalizing still keeps
    // only a reading that matches the day asked about.
    if (out.payload === undefined && out.limited) out = await ask(false);
    if (out.payload === undefined) return null;
    return normalizeAviationstack(out.payload, { flight_no, flight_date });
  } catch (e) {
    console.error("aviationstack call threw", e);
    return null;
  }
}

/** How many paid readings today, across every feature that asks. */
export async function spentToday(sb: {
  from: (t: string) => any;
}): Promise<number> {
  const dayStart = new Date().toISOString().slice(0, 10);
  const { count } = await sb
    .from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("provider", "aviationstack")
    .eq("cache_hit", false)
    .gte("created_at", `${dayStart}T00:00:00Z`);
  return count ?? 0;
}

/**
 * A reading inside the ceiling, with its receipt. `over_budget` is a real answer
 * a caller must be able to say out loud, not an error to swallow.
 */
export async function countedRead(
  sb: { from: (t: string) => any },
  where: { userId: string; feature: string; planId?: string | null },
  flight_no: string,
  flight_date: string,
): Promise<{ live: LiveFlight | null; over_budget: boolean }> {
  const spent = await spentToday(sb);
  if (spent >= DAILY_READING_CEILING) return { live: null, over_budget: true };
  const live = await readFlight(flight_no, flight_date);
  await sb.from("api_usage_logs").insert({
    owner_id: where.userId,
    user_id: where.userId,
    provider: "aviationstack",
    feature: where.feature,
    request_type: "flight_status",
    status: live ? "success" : "failed",
    cache_hit: false,
    related_entity_type: "flight_plan",
    related_entity_id: where.planId ?? null,
  } as never);
  return { live, over_budget: false };
}
