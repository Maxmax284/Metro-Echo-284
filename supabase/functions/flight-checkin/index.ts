// flight-checkin — where to stand before security, read off an official page.
//
// Doctrine:
//   - There is no API anywhere for check-in zones and counters. They live on
//     airline and airport pages and change by season and time of day, so this is
//     always a dated reading of a page, never a live fact and never a guess.
//   - Only on request. Nothing here runs on a schedule, and nothing scrapes in
//     the background.
//   - Read only. Echo does not check anyone in, drop a bag, or hold a seat.
//   - The page Echo read and the day it read it are stored with the answer, and
//     the signs at the counter win over both.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { adminClient, runGuarded } from "../_shared/apiGuard.ts";
import { fetchPage } from "../_shared/webFetch.ts";
import { safeUrl } from "../_shared/webLook.ts";
import { airport } from "../_shared/airports.ts";
import { carrierId, mergeIdentity, boardIdentity, type FlightIdentity } from "../_shared/flightIdentity.ts";

const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const Body = z.object({ plan_id: z.string().uuid() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Hit = { title: string; url: string; snippet: string };

async function search(q: string): Promise<Hit[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("num", "6");
  url.searchParams.set("api_key", SERPAPI_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`serpapi [${res.status}]`);
  const j = await res.json();
  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  return organic
    .map((o: Record<string, unknown>) => ({
      title: String(o?.title ?? "").slice(0, 300),
      url: String(o?.link ?? ""),
      snippet: String(o?.snippet ?? "").slice(0, 400),
    }))
    .filter((h: Hit) => h.url);
}

/** An airline's own site or the airport's own site, best first, nothing else. */
function officialFirst(hits: Hit[], carrier: string | null, airportName: string | null): Hit[] {
  const words = [carrier, airportName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const scored = hits
    .map((h) => {
      const host = h.url.toLowerCase();
      const official =
        /\.aero\b|airport|\bair\b|airways|airlines/.test(host) && !/wikipedia|tripadvisor|reddit|flightaware/.test(host);
      const hit = words.filter((w) => host.includes(w.slice(0, 5))).length;
      return { h, score: (official ? 2 : 0) + hit };
    })
    .sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, 3).map((s) => s.h);
}

/** One sentence from the page, or nothing. The gap is an answer. */
async function areaFrom(question: string, text: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      messages: [
        {
          role: "system",
          content:
            "You read ONE page and pull out only where a traveller physically checks in: the airline's " +
            "check-in area, zone, counter row or terminal, as the page states it. Answer with that place " +
            "in under 12 words, no sentence, no advice. If the page does not state it, answer exactly NONE.",
        },
        { role: "user", content: `${question}\n\n${text.slice(0, 9000)}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const out = String(j?.choices?.[0]?.message?.content ?? "").trim();
  if (!out || /^none$/i.test(out) || out.length > 120) return null;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    if (!SERPAPI_KEY) {
      return json({ ok: false, answer: "Echo has no web lookup configured, so it cannot read an airline page." });
    }

    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: who } = await asUser.auth.getUser();
    const user = who?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: plan } = await asUser
      .from("flight_plans")
      .select("*")
      .eq("id", parsed.data.plan_id)
      .maybeSingle();
    if (!plan) return json({ error: "not_found" }, 404);

    const options = Array.isArray(plan.options) ? [...(plan.options as any[])] : [];
    const at = Math.max(0, options.findIndex((o) => o.id === plan.chosen_option_id));
    const option = options[at] ?? null;
    if (!option) return json({ ok: false, answer: "That flight has no leg on record to look up." });

    const kept = (option.identity ?? null) as FlightIdentity | null;
    const identity = mergeIdentity(kept, {
      marketing: kept?.marketing ?? carrierId({ carrier: option.airline, flight_no: option.flight_no }),
    });
    const board = boardIdentity(identity);
    const carrier = board?.carrier ?? option.airline ?? null;
    const port = airport(String(plan.origin ?? ""));
    const airportName = port?.name ?? String(plan.origin ?? "");
    if (!carrier) {
      return json({
        ok: false,
        answer:
          "Echo does not know which airline flies this leg yet, so it will not go looking for the wrong counter. " +
          "Check the flight first and it can look again.",
      });
    }

    const question = `Which check-in area, zone or counters does ${carrier} use at ${airportName}?`;
    const guarded = await runGuarded(
      {
        owner_id: user.id,
        user_id: user.id,
        provider: "serpapi",
        feature: "flight.checkin_look",
        query: question,
        cache_ttl_seconds: 6 * 3600,
      },
      () => search(`${carrier} check-in counters zone ${airportName} terminal departures`),
    );
    if (!guarded.ok) {
      return json({ ok: false, blocked: guarded.reason, answer: "Web lookups are switched off, so Echo did not go looking." });
    }

    const picks = officialFirst(guarded.data as Hit[], carrier, airportName);
    if (!picks.length) {
      return json({
        ok: false,
        answer: `Echo found nothing official about ${carrier} check-in at ${airportName}, so it is not naming a zone.`,
      });
    }

    /* Airline sites often refuse a plain reader. Echo tries the next official
       page rather than inventing a zone, and gives up out loud. */
    let read: { text: string; host: string; url: string } | null = null;
    let area: string | null = null;
    const tried: string[] = [];
    for (const pick of picks) {
      const checked = safeUrl(pick.url);
      if (!checked.ok) continue;
      const page = await runGuarded(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "web-page",
          feature: "flight.checkin_read",
          query: checked.url,
          cache_ttl_seconds: 6 * 3600,
        },
        () => fetchPage(checked.url),
      );
      const host = new URL(checked.url).host;
      tried.push(host);
      if (!page.ok || !(page.data as any)?.ok) continue;
      const got = (page.data as any).read as { text: string; host: string; url: string };
      const found = await areaFrom(question, got.text);
      if (found) {
        read = got;
        area = found;
        break;
      }
    }
    if (!read || !area) {
      return json({
        ok: false,
        tried,
        answer:
          `Echo read ${tried.length ? tried.join(", ") : "nothing"} and none of them state where ${carrier} ` +
          `checks in at ${airportName}, so it is not going to name a zone. The departures hall signs are the truth here.`,
      });
    }


    const read_at = new Date().toISOString();
    const next = mergeIdentity(identity, {
      check_in: { where: area, source_url: read.url, source_host: read.host, read_at },
    });
    options[at] = { ...option, identity: next };
    await asUser.from("flight_plans").update({ options: options as never }).eq("id", plan.id);
    await asUser.from("audit_log").insert({
      user_id: user.id,
      organization_id: plan.organization_id ?? null,
      entity_type: "flight_plan",
      entity_id: plan.id,
      event: "flight.checkin_looked_up",
      payload: { carrier, airport: plan.origin, where: area, source: read.url, read_at },
    } as never);

    return json({
      ok: true,
      identity: next,
      where: area,
      source_host: read.host,
      source_url: read.url,
      read_at,
      answer: `${carrier} checks in at ${area} — read from ${read.host} today. The signs at the counter win over this.`,
    });
  } catch (e) {
    console.error("flight-checkin", e);
    return json({ ok: false, answer: "Echo hit an error looking that up, so nothing was filed." }, 200);
  }
});
