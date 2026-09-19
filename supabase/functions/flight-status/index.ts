// flight-status — where a flight actually is, once, on request.
//
// Doctrine:
//   - Read only. One provider call, one reading, recorded against the plan with
//     the time it was taken. No check-in arm, no rebooking arm, no buying arm.
//   - A provider that carries nothing for a flight is reported as carrying
//     nothing. Silence is never dressed up as "on time".
//   - A reading taken minutes ago is reused rather than paid for twice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { askFlight, PlanLimited } from "../_shared/flightAsk.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { normalizeAviationstack, statusDiff, statusWords, STATUS_LAW, type LiveFlight } from "../_shared/flightStatus.ts";
import { carrierId, mergeIdentity, type FlightIdentity } from "../_shared/flightIdentity.ts";

/**
 * Fold the provider's carrier names into the flight's own identity. Returns the
 * rewritten options only when something new was learned, so an unchanged
 * reading writes nothing and leaves no receipt.
 */
function foldIdentity(plan: any, live: LiveFlight): { options: any[]; identity: FlightIdentity } | null {
  const options = Array.isArray(plan?.options) ? [...(plan.options as any[])] : [];
  if (!options.length) return null;
  const at = Math.max(
    0,
    options.findIndex((o) => o.id === plan?.chosen_option_id),
  );
  const kept = (options[at]?.identity ?? null) as FlightIdentity | null;
  const marketing =
    carrierId({
      carrier: live.marketed_as?.carrier ?? live.airline,
      carrier_code: live.marketed_as?.carrier_code ?? live.airline_code,
      flight_no: live.marketed_as?.flight_no ?? live.flight_no,
    }) ?? null;
  const operating = live.operated_by
    ? carrierId({
        carrier: live.operated_by.carrier,
        carrier_code: live.operated_by.carrier_code,
        flight_no: live.operated_by.flight_no,
      })
    : null;
  const identity = mergeIdentity(kept, { marketing, operating });
  if (JSON.stringify(identity) === JSON.stringify(kept)) return null;
  options[at] = { ...options[at], identity };
  return { options, identity };
}

const KEY = Deno.env.get("AVIATIONSTACK_API_KEY") ?? Deno.env.get("FLIGHT_API_KEY") ?? "";
const DAILY_BUDGET = Number(Deno.env.get("FLIGHT_DAILY_BUDGET") ?? "40");
/* Automatic readings are only allowed close to the flight. Outside that window
   the deck keeps drawing the last stamped reading rather than paying again. */
const AUTO_BEFORE_MS = 30 * 60 * 60_000;
const AUTO_AFTER_MS = 4 * 60 * 60_000;

/** True when an unattended reading is fair to pay for on this plan, right now. */
function insideAutoWindow(plan: any, previous: LiveFlight | null, now: number): boolean {
  const options = Array.isArray(plan?.options) ? (plan.options as any[]) : [];
  const chosen = options.find((o) => o.id === plan?.chosen_option_id) ?? options[0] ?? null;
  const dep =
    previous?.departure?.actual ??
    previous?.departure?.estimated ??
    previous?.departure?.scheduled ??
    chosen?.depart_at ??
    (plan?.depart_on ? `${String(plan.depart_on).slice(0, 10)}T00:00:00Z` : null);
  const arr = previous?.arrival?.actual ?? previous?.arrival?.estimated ?? previous?.arrival?.scheduled ?? null;
  const depMs = dep ? Date.parse(dep) : NaN;
  if (!Number.isFinite(depMs)) return false;
  const endMs = arr && Number.isFinite(Date.parse(arr)) ? Date.parse(arr) : depMs + 20 * 60 * 60_000;
  return now >= depMs - AUTO_BEFORE_MS && now <= endMs + AUTO_AFTER_MS;
}
const FRESH_MS = 5 * 60_000;

const BodySchema = z.object({
  probe: z.boolean().optional(),
  /** The deck refreshing itself rather than a person tapping. Budget-bound. */
  auto: z.boolean().optional(),
  plan_id: z.string().uuid().optional(),
  flight_no: z.string().min(3).max(8).optional(),
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function askProvider(flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  return await askFlight(KEY, flight_no, flight_date);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { probe, plan_id, auto } = parsed.data;

    /* The app asks once whether a provider exists at all, so the capability
       panel can say live or needs connecting without ever guessing. */
    if (probe) return json({ configured: !!KEY });

    if (!KEY) {
      return json(
        {
          error: "no_flight_provider",
          message: "No flight-data key is configured, so live status cannot be read.",
        },
        503,
      );
    }

    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: who } = await asUser.auth.getUser();
    const user = who?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    let flight_no = (parsed.data.flight_no ?? "").replace(/\s+/g, "").toUpperCase();
    let flight_date = parsed.data.flight_date ?? "";
    let previous: LiveFlight | null = null;
    let plan: any = null;

    if (plan_id) {
      const { data } = await asUser.from("flight_plans").select("*").eq("id", plan_id).maybeSingle();
      if (!data) return json({ error: "not_found", message: "That flight is not on your record." }, 404);
      plan = data;
      const options = Array.isArray(data.options) ? (data.options as any[]) : [];
      const chosen = options.find((o) => o.id === data.chosen_option_id) ?? options[0] ?? null;
      flight_no = String(chosen?.flight_no ?? flight_no).replace(/\s+/g, "").toUpperCase();
      flight_date = flight_date || String(data.depart_on ?? "").slice(0, 10);
      previous = (data.live_status ?? null) as LiveFlight | null;
      const age = data.live_checked_at ? Date.now() - new Date(data.live_checked_at).getTime() : Infinity;
      if (previous && age < FRESH_MS) {
        return json({
          live: previous,
          words: statusWords(previous),
          news: null,
          reused: true,
          law: STATUS_LAW,
        });
      }
    }

    if (!flight_no || !flight_date) {
      return json({ error: "need_flight", message: "A flight number and a date are needed." }, 400);
    }

    /* An unattended refresh is held to the flight's own window, so the deck
       cannot quietly read a flight that is weeks away. */
    if (auto && plan && !insideAutoWindow(plan, previous, Date.now())) {
      return json({
        live: previous,
        words: previous ? statusWords(previous) : "Too early for an automatic airline check on this flight.",
        news: null,
        auto_held: "outside_window",
        law: STATUS_LAW,
      });
    }

    /* The day's ledger of paid readings — the ceiling nothing reads past. */
    const dayStart = new Date().toISOString().slice(0, 10);
    const { count: spentToday } = await asUser
      .from("api_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("provider", "aviationstack")
      .eq("cache_hit", false)
      .gte("created_at", `${dayStart}T00:00:00Z`);
    if ((spentToday ?? 0) >= DAILY_BUDGET) {
      return json({
        live: previous,
        words: previous
          ? `${statusWords(previous)} Today's airline checks are used up, so this is the last reading on record.`
          : "Today's airline checks are used up. Nothing is wrong with the flight — Echo just cannot ask again until tomorrow.",
        news: null,
        budget_spent: true,
        law: STATUS_LAW,
      });
    }

    const live = await askProvider(flight_no, flight_date);
    await asUser.from("api_usage_logs").insert({
      owner_id: user.id,
      user_id: user.id,
      provider: "aviationstack",
      feature: auto ? "flight-deck-auto" : "flight-status",
      request_type: "flight_status",
      status: live ? "success" : "failed",
      cache_hit: false,
      related_entity_type: plan ? "flight_plan" : null,
      related_entity_id: plan?.id ?? null,
    } as never);
    if (!live) {
      /* Stamp the attempt even though it carried nothing, so the deck knows it
         asked and does not pay to ask again a moment later. */
      if (plan) {
        await asUser
          .from("flight_plans")
          .update({ live_checked_at: new Date().toISOString() })
          .eq("id", plan.id);
      }
      return json({
        live: null,
        words: `${flight_no} on ${flight_date} — the provider carries nothing for it yet. That is what it said, not that the flight is wrong.`,
        news: null,
        law: STATUS_LAW,
      });
    }

    const news = statusDiff(previous, live);

    if (plan) {
      await asUser
        .from("flight_plans")
        .update({ live_status: live as never, live_checked_at: live.checked_at })
        .eq("id", plan.id);
      /* A receipt for every asked reading, and for an unattended one only when
         it actually changed something. Otherwise the log would fill with "same". */
      if (!auto || news) {
        await asUser.from("audit_log").insert({
          user_id: user.id,
          organization_id: plan.organization_id ?? null,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.status_read",
          payload: { flight_no, flight_date, status: live.status, changed: news, auto: !!auto, bought: false },
        } as never);
      }

      /* The airline that actually flies it is the whole answer to "where do I
         go" in a terminal, so it is kept on the flight rather than thrown away
         with the rest of the reading. Nothing already on record is erased. */
      const filled = foldIdentity(plan, live);
      if (filled) {
        await asUser.from("flight_plans").update({ options: filled.options as never }).eq("id", plan.id);
        await asUser.from("audit_log").insert({
          user_id: user.id,
          organization_id: plan.organization_id ?? null,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.identity_filled",
          payload: { flight_no, source: "aviationstack", identity: filled.identity },
        } as never);
      }
    }

    return json({ live, words: statusWords(live), news, law: STATUS_LAW });
  } catch (e) {
    console.error("flight-status", e);
    if (e instanceof PlanLimited) {
      return json({
        live: null,
        words: "The flight-data plan you're on won't answer this one. Nothing is wrong with the flight — the provider just won't say.",
        news: null,
        plan_limited: true,
        law: STATUS_LAW,
      });
    }
    return json({ error: "provider_failed", message: e instanceof Error ? e.message : "unknown" }, 502);
  }
});
