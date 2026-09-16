// flight-status — where a flight actually is, once, on request.
//
// Doctrine:
//   - Read only. One provider call, one reading, recorded against the plan with
//     the time it was taken. No check-in arm, no rebooking arm, no buying arm.
//   - A provider that carries nothing for a flight is reported as carrying
//     nothing. Silence is never dressed up as "on time".
//   - A reading taken minutes ago is reused rather than paid for twice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { normalizeAviationstack, statusDiff, statusWords, STATUS_LAW, type LiveFlight } from "../_shared/flightStatus.ts";

const KEY = Deno.env.get("AVIATIONSTACK_API_KEY") ?? Deno.env.get("FLIGHT_API_KEY") ?? "";
const FRESH_MS = 5 * 60_000;

const BodySchema = z.object({
  probe: z.boolean().optional(),
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
  const url = new URL("https://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", KEY);
  url.searchParams.set("flight_iata", flight_no);
  url.searchParams.set("flight_date", flight_date);
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) {
    console.error(`aviationstack failed [${res.status}]: ${text}`);
    throw new Error(`[${res.status}] ${text}`);
  }
  const payload = JSON.parse(text || "{}");
  if (payload?.error) {
    console.error("aviationstack error body", JSON.stringify(payload.error));
    throw new Error(`[200] ${JSON.stringify(payload.error)}`);
  }
  return normalizeAviationstack(payload, { flight_no, flight_date });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { probe, plan_id } = parsed.data;

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

    const live = await askProvider(flight_no, flight_date);
    if (!live) {
      return json({
        live: null,
        words: `${flight_no} on ${flight_date} — the provider carries nothing for it. That is what it said, not that the flight is fine.`,
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
      await asUser.from("audit_log").insert({
        user_id: user.id,
        organization_id: plan.organization_id ?? null,
        entity_type: "flight_plan",
        entity_id: plan.id,
        event: "flight.status_read",
        payload: { flight_no, flight_date, status: live.status, changed: news, bought: false },
      } as never);
    }

    return json({ live, words: statusWords(live), news, law: STATUS_LAW });
  } catch (e) {
    console.error("flight-status", e);
    return json({ error: "provider_failed", message: e instanceof Error ? e.message : "unknown" }, 502);
  }
});
