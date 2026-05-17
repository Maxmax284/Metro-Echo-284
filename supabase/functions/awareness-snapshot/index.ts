// awareness-snapshot: assemble a compact + full awareness snapshot for a place.
// Routes all external provider calls through apiGuard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { runGuarded, adminClient } from "../_shared/apiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  place_id: z.string().uuid(),
  force_refresh: z.boolean().optional(),
});

type WeatherSummary = { tempC: number | null; condition: string | null; updated_at: string } | null;

async function fetchWeather(lat: number, lon: number): Promise<WeatherSummary> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const code = j?.current?.weather_code;
  const condition = weatherCodeLabel(code);
  return {
    tempC: typeof j?.current?.temperature_2m === "number" ? j.current.temperature_2m : null,
    condition,
    updated_at: new Date().toISOString(),
  };
}

function weatherCodeLabel(code: number | undefined): string | null {
  if (code == null) return null;
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 99) return "thunderstorm";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { place_id, force_refresh } = parsed.data;

    const { data: place, error: pErr } = await userClient
      .from("awareness_places")
      .select("id,label,geo,country,region")
      .eq("id", place_id)
      .maybeSingle();
    if (pErr || !place) {
      return new Response(JSON.stringify({ error: "place not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reuse fresh snapshot unless force_refresh
    if (!force_refresh) {
      const { data: existing } = await userClient
        .from("awareness_snapshots")
        .select("id, compact, full_data, sources_used, generated_at, expires_at")
        .eq("place_id", place_id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
        return new Response(JSON.stringify({ ok: true, snapshot: existing, reused: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const sources_used: string[] = ["internal"];

    // Internal context: latest briefings for this place
    const { data: briefings } = await userClient
      .from("awareness_briefings")
      .select("section, content, confidence, generated_at")
      .eq("place_id", place_id)
      .order("generated_at", { ascending: false })
      .limit(16);

    // Weather via guard
    let weather: WeatherSummary = null;
    const geo = place.geo as { lat?: number; lon?: number } | null;
    if (geo?.lat != null && geo?.lon != null) {
      const guard = await runGuarded<WeatherSummary>(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "open-meteo",
          feature: "weather.current",
          query: `weather:${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`,
          location: { lat: geo.lat, lon: geo.lon },
          cache_ttl_seconds: 30 * 60,
          related_entity_type: "awareness_place",
          related_entity_id: place_id,
        },
        () => fetchWeather(geo.lat!, geo.lon!),
      );
      if (guard.ok) {
        weather = guard.data;
        sources_used.push(guard.cached ? "open-meteo:cached" : "open-meteo");
      }
    }

    // Optional SerpApi local signals (only when enabled + key present)
    let local_signals: Array<{ title: string; snippet?: string; link?: string }> | null = null;
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    if (SERPAPI_KEY && geo?.lat != null && geo?.lon != null) {
      const serp = await runGuarded<typeof local_signals>(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "serpapi",
          feature: "awareness.local_signals",
          query: `local:${place.label}:${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`,
          location: { lat: geo.lat, lon: geo.lon },
          cache_ttl_seconds: 60 * 60,
          related_entity_type: "awareness_place",
          related_entity_id: place_id,
        },
        async () => {
          const q = encodeURIComponent(`${place.label} ${place.country ?? ""} local news today`.trim());
          const url = `https://serpapi.com/search.json?engine=google&q=${q}&num=5&api_key=${SERPAPI_KEY}`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`serpapi ${r.status}`);
          const j = await r.json();
          const items = (j.organic_results ?? []).slice(0, 5).map((it: any) => ({
            title: String(it.title ?? ""),
            snippet: it.snippet ? String(it.snippet) : undefined,
            link: it.link ? String(it.link) : undefined,
          }));
          return items;
        },
      );
      if (serp.ok) {
        local_signals = serp.data;
        sources_used.push(serp.cached ? "serpapi:cached" : "serpapi");
      }
    }

    // Optional Gemini synthesis (skipped if disabled — guard returns block)
    let summary: string | null = null;
    const briefingsText = (briefings ?? [])
      .map((b) => `[${b.section}] ${b.content}`)
      .join("\n\n")
      .slice(0, 6000);
    const localText = local_signals?.length
      ? local_signals.map((s) => `- ${s.title}${s.snippet ? `: ${s.snippet}` : ""}`).join("\n")
      : "(none)";

    const synth = await runGuarded<string>(
      {
        owner_id: user.id,
        user_id: user.id,
        provider: "lovable-ai",
        feature: "awareness.synthesis",
        query: `synth:${place_id}:${weather?.condition ?? "na"}`,
        cache_ttl_seconds: 15 * 60,
        related_entity_type: "awareness_place",
        related_entity_id: place_id,
      },
      async () => {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) throw new Error("LOVABLE_API_KEY not configured");
        const prompt = `Place: ${place.label}\nCountry: ${place.country ?? "?"}\nWeather: ${weather ? `${weather.tempC}C ${weather.condition}` : "unknown"}\n\nLocal signals:\n${localText}\n\nBriefings:\n${briefingsText || "(none)"}\n\nReturn a 2-3 sentence operational pulse, concrete and grounded. No fluff.`;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are an operational awareness analyst. Be concrete, grounded, and brief." },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (!r.ok) throw new Error(`ai ${r.status}`);
        const j = await r.json();
        return (j.choices?.[0]?.message?.content ?? "").trim();
      },
    );
    if (synth.ok) {
      summary = synth.data;
      sources_used.push(synth.cached ? "gemini:cached" : "gemini");
    }

    const compact = {
      place: { id: place.id, label: place.label },
      weather,
      summary,
      local_signals_count: local_signals?.length ?? 0,
      briefing_count: (briefings ?? []).length,
      generated_at: new Date().toISOString(),
    };

    const full_data = {
      place,
      weather,
      summary,
      local_signals: local_signals ?? [],
      briefings: briefings ?? [],
    };

    const db = adminClient();
    const { data: inserted, error: insErr } = await db
      .from("awareness_snapshots")
      .insert({
        user_id: user.id,
        place_id,
        compact,
        full_data,
        sources_used,
      })
      .select("id, compact, full_data, sources_used, generated_at, expires_at")
      .maybeSingle();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, snapshot: inserted, reused: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
