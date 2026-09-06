import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// awareness-snapshot: assemble a compact + full awareness snapshot for a place.
// Routes all external provider calls through apiGuard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { runGuarded, adminClient } from "../_shared/apiGuard.ts";
import { AWARENESS_VOICE } from "../_shared/vantaVoice.ts";


const Body = z.object({
  place_id: z.string().uuid(),
  force_refresh: z.boolean().optional(),
});

type ForecastHour = { at: string; tempC: number | null; condition: string | null; rainChance: number | null };
/* Current conditions plus the hours still ahead, so the evening read has a real
   window to stand on instead of a single reading of right now. */
type WeatherSummary = {
  tempC: number | null;
  condition: string | null;
  updated_at: string;
  hourly?: ForecastHour[];
} | null;

async function fetchWeather(lat: number, lon: number): Promise<WeatherSummary> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&forecast_days=2&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const code = j?.current?.weather_code;
  const condition = weatherCodeLabel(code);
  /* Open-Meteo returns hourly arrays in the place's own timezone. Kept as
     given — no interpolation, no gap filling. */
  const times: string[] = Array.isArray(j?.hourly?.time) ? j.hourly.time : [];
  const temps: unknown[] = Array.isArray(j?.hourly?.temperature_2m) ? j.hourly.temperature_2m : [];
  const codes: unknown[] = Array.isArray(j?.hourly?.weather_code) ? j.hourly.weather_code : [];
  const rain: unknown[] = Array.isArray(j?.hourly?.precipitation_probability) ? j.hourly.precipitation_probability : [];
  const hourly: ForecastHour[] = times.slice(0, 48).map((t, i) => ({
    at: String(t),
    tempC: typeof temps[i] === "number" ? (temps[i] as number) : null,
    condition: weatherCodeLabel(typeof codes[i] === "number" ? (codes[i] as number) : undefined),
    rainChance: typeof rain[i] === "number" ? (rain[i] as number) : null,
  }));

  return {
    tempC: typeof j?.current?.temperature_2m === "number" ? j.current.temperature_2m : null,
    condition,
    updated_at: new Date().toISOString(),
    hourly,
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

// ---- Community signals (Reddit) ---------------------------------------------
// Strategy: SerpApi Reddit engine primary -> public reddit.com JSON fallback.
// Both paths independently kill-switched so the skeleton is ready for more
// sources (HN, forums, Bluesky...) without further plumbing.
type CommunityItem = {
  source: "reddit";
  via: "serpapi" | "public";
  title: string;
  snippet?: string;
  link?: string;
  subreddit?: string;
  score?: number;
  comments?: number;
  created_utc?: number;
};

const RETRYABLE_STATUS = new Set([400, 408, 425, 429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  label: string,
  maxAttempts = 3,
): Promise<Response | null> {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return r;
      lastStatus = r.status;
      lastBody = await r.text().catch(() => "");
      if (!RETRYABLE_STATUS.has(r.status) || attempt === maxAttempts) {
        console.warn(`${label} ${r.status} (attempt ${attempt}/${maxAttempts}): ${lastBody.slice(0, 200)}`);
        return null;
      }
      console.warn(`${label} ${r.status} (attempt ${attempt}/${maxAttempts}), retrying`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === maxAttempts) {
        console.warn(`${label} network error (attempt ${attempt}/${maxAttempts}): ${msg}`);
        return null;
      }
      console.warn(`${label} network error (attempt ${attempt}/${maxAttempts}): ${msg}, retrying`);
    }
    // Exponential backoff with jitter: 250ms, 600ms, ...
    const delay = 250 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
    await new Promise((res) => setTimeout(res, delay));
  }
  if (lastStatus) console.warn(`${label} gave up after ${maxAttempts} attempts (last ${lastStatus})`);
  return null;
}

async function fetchRedditViaSerpApi(apiKey: string, query: string): Promise<CommunityItem[]> {
  const url = `https://serpapi.com/search.json?engine=reddit&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
  const r = await fetchWithRetry(url, undefined, "serpapi-reddit");
  if (!r) return [];
  const j = await r.json().catch(() => ({}));
  const rows = (j.posts ?? j.organic_results ?? []).slice(0, 6);
  return rows.map((it: any) => ({
    source: "reddit" as const,
    via: "serpapi" as const,
    title: String(it.title ?? it.name ?? ""),
    snippet: it.snippet ? String(it.snippet) : (it.selftext ? String(it.selftext).slice(0, 240) : undefined),
    link: it.link ?? it.permalink ?? undefined,
    subreddit: it.subreddit ?? it.community ?? undefined,
    score: typeof it.score === "number" ? it.score : undefined,
    comments: typeof it.num_comments === "number" ? it.num_comments : undefined,
  }));
}


async function fetchRedditPublic(query: string): Promise<CommunityItem[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=8&t=week`;
  const r = await fetchWithRetry(
    url,
    { headers: { "User-Agent": "vanta-awareness/1.0 (street-signal fallback)" } },
    "reddit-public",
  );
  if (!r) return [];
  const j = await r.json().catch(() => ({}));

  const children = j?.data?.children ?? [];
  return children.slice(0, 6).map((c: any) => {
    const d = c?.data ?? {};
    return {
      source: "reddit" as const,
      via: "public" as const,
      title: String(d.title ?? ""),
      snippet: d.selftext ? String(d.selftext).slice(0, 240) : undefined,
      link: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
      subreddit: d.subreddit ? String(d.subreddit) : undefined,
      score: typeof d.score === "number" ? d.score : undefined,
      comments: typeof d.num_comments === "number" ? d.num_comments : undefined,
      created_utc: typeof d.created_utc === "number" ? d.created_utc : undefined,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, userClient as any);
    if (!user) return unauthorized();

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

    // ---- Weird-location detection ------------------------------------------
    // Deterministic, non-AI. Emits a full VantaSignal-shaped object so the UI
    // renders it through the same pipeline as model-generated signals.
    // No paid API calls.
    type LocationWarning = {
      signal_type: "location_warning";
      title: string;
      short_summary: string;
      confidence: "low" | "medium" | "high";
      risk_level: "none" | "low" | "medium" | "high";
      source_labels: string[];
      freshness: "live" | "cached" | "stale" | "unknown";
      why_it_matters: string;
      what_to_do_next: string;
      requires_confirmation: boolean;
      confirmation_reason: string;
      available_routes: string[];
      long_detail: string;
      display_priority: number;
      reasons: string[];
    };
    let location_warning: LocationWarning | null = null;
    {
      const reasons: string[] = [];
      const geoAny = place.geo as { lat?: number; lon?: number; acc?: number; updated_at?: string } | null;
      const hasGeo = geoAny?.lat != null && geoAny?.lon != null;
      const hasCountry = !!place.country;
      const hasRegion = !!place.region;
      if (!hasGeo) {
        reasons.push("No coordinates on this place yet.");
      } else {
        if (!hasCountry && !hasRegion) reasons.push("No country or region matched these coordinates.");
        if (typeof geoAny?.acc === "number" && geoAny.acc > 500) {
          reasons.push(`GPS accuracy is weak (±${Math.round(geoAny.acc)}m).`);
        }
        const lat = geoAny!.lat!;
        const lon = geoAny!.lon!;
        if (!hasCountry && Math.abs(lat) < 60 && Math.abs(lon) < 180) {
          reasons.push("Coordinates didn't reverse-geocode to a known land area.");
        }
      }
      if (reasons.length > 0) {
        location_warning = {
          signal_type: "location_warning",
          title: "Location looks off",
          short_summary: hasGeo
            ? "Your coordinates don't line up with a normal land-based spot."
            : "I don't have coordinates for this place yet.",
          confidence: "low",
          risk_level: "low",
          source_labels: ["internal"],
          freshness: hasGeo ? "live" : "unknown",
          why_it_matters:
            "If I treat shaky location data as ground truth, every other signal on the radar inherits the mistake.",
          what_to_do_next:
            "Confirm the active place, switch to a saved place, or refresh your location.",
          requires_confirmation: true,
          confirmation_reason: reasons.join(" "),
          available_routes: ["confirm_location", "use_saved_place", "refresh_signal", "ask_vanta"],
          long_detail: "",
          display_priority: 2,
          reasons,
        };
      }
    }

    const { data: briefings } = await userClient
      .from("awareness_briefings")
      .select("section, content, confidence, generated_at")
      .eq("place_id", place_id)
      .order("generated_at", { ascending: false })
      .limit(16);

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

    // ---- Tier-aware query construction -------------------------------------
    type Tier = "exact" | "saved" | "area" | "city" | "country" | "unknown";
    const geoCity: string | null = (place.geo as any)?.city ?? null;
    const accuracy: number | null = Number.isFinite((place.geo as any)?.acc) ? Number((place.geo as any).acc) : null;
    const tier: Tier = !place.country
      ? "unknown"
      : !geoCity && !place.region ? "country"
      : !geoCity ? "city"
      : accuracy != null && accuracy <= 150 ? "exact"
      : accuracy == null && place.label ? "saved"
      : "area";

    const tierScope =
      tier === "exact" || tier === "saved" ? place.label
      : tier === "area" || tier === "city" ? (geoCity ?? place.region ?? place.country!)
      : tier === "country" ? place.country!
      : "";
    const tierWebQuery =
      tier === "country"
        ? `${tierScope} local tips payments transport connectivity tourist`
        : tier === "city" || tier === "area"
          ? `${tierScope} ${place.country ?? ""} local tips connectivity payments`
          : `${tierScope} local tips today`;

    // SerpApi web + Google Maps (nearby services) — only when tier is useful.
    let local_signals: Array<{ title: string; snippet?: string; link?: string; kind?: string }> | null = null;
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    if (SERPAPI_KEY && tier !== "unknown") {
      const serp = await runGuarded<typeof local_signals>(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "serpapi",
          feature: "awareness.local_signals",
          query: `local:${tier}:${tierScope}`,
          location: geo ?? undefined,
          cache_ttl_seconds: 60 * 60,
          related_entity_type: "awareness_place",
          related_entity_id: place_id,
        },
        async () => {
          const items: NonNullable<typeof local_signals> = [];

          // Tier-aware general web search
          const webUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(tierWebQuery)}&num=5&api_key=${SERPAPI_KEY}`;
          const wr = await fetch(webUrl);
          if (wr.ok) {
            const wj = await wr.json();
            for (const it of (wj.organic_results ?? []).slice(0, 5)) {
              items.push({
                title: String(it.title ?? ""),
                snippet: it.snippet ? String(it.snippet) : undefined,
                link: it.link ? String(it.link) : undefined,
                kind: "web",
              });
            }
          }

          // Google Maps engine for nearby services — only when exact/saved with coords.
          // Pull richer detail (rating, hours, type, distance) so downstream cards
          // can cite real venues by name instead of leaning on Reddit chatter.
          if ((tier === "exact" || tier === "saved") && geo?.lat != null && geo?.lon != null) {
            const ll = `@${geo.lat},${geo.lon},14z`;
            const mapsUrl = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent("ATM pharmacy convenience cafe")}&ll=${encodeURIComponent(ll)}&type=search&api_key=${SERPAPI_KEY}`;
            const mr = await fetch(mapsUrl);
            if (mr.ok) {
              const mj = await mr.json();
              for (const p of (mj.local_results ?? []).slice(0, 8)) {
                const detailBits = [
                  p.type,
                  p.address,
                  p.open_state,
                  p.rating != null ? `★${p.rating}${p.reviews ? ` (${p.reviews})` : ""}` : null,
                  p.price,
                ].filter(Boolean);
                items.push({
                  title: String(p.title ?? ""),
                  snippet: detailBits.join(" · ") || undefined,
                  link: p.website ?? undefined,
                  kind: "place",
                });
              }
            }
          }


          return items;
        },
      );
      if (serp.ok) {
        local_signals = serp.data;
        sources_used.push(serp.cached ? "serpapi:cached" : "serpapi");
        if ((tier === "exact" || tier === "saved") && (local_signals ?? []).some((i) => i.kind === "place")) {
          sources_used.push("google_maps");
        }
      }
    }

    // Community: SerpApi Reddit primary -> public Reddit fallback.
    let community: CommunityItem[] = [];
    const communityQuery = `${place.label} ${place.country ?? ""}`.trim();
    const communityCacheKey = `community:${place.label}:${(geo?.lat ?? 0).toFixed(2)},${(geo?.lon ?? 0).toFixed(2)}`;

    if (SERPAPI_KEY && communityQuery.length > 0) {
      const r1 = await runGuarded<CommunityItem[]>(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "reddit-serpapi",
          feature: "awareness.community.reddit",
          query: communityCacheKey,
          location: geo ?? undefined,
          cache_ttl_seconds: 60 * 60,
          related_entity_type: "awareness_place",
          related_entity_id: place_id,
        },
        () => fetchRedditViaSerpApi(SERPAPI_KEY!, communityQuery),
      );
      if (r1.ok && r1.data?.length) {
        community = r1.data;
        sources_used.push(r1.cached ? "reddit-serpapi:cached" : "reddit-serpapi");
      }
    }

    if (community.length === 0 && communityQuery.length > 0) {
      const r2 = await runGuarded<CommunityItem[]>(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "reddit-public",
          feature: "awareness.community.reddit_public",
          query: communityCacheKey,
          location: geo ?? undefined,
          cache_ttl_seconds: 30 * 60,
          related_entity_type: "awareness_place",
          related_entity_id: place_id,
        },
        () => fetchRedditPublic(communityQuery),
      );
      if (r2.ok && r2.data?.length) {
        community = r2.data;
        sources_used.push(r2.cached ? "reddit-public:cached" : "reddit-public");
      }
    }

    // Gemini synthesis
    let summary: string | null = null;
    const briefingsText = (briefings ?? [])
      .map((b) => `[${b.section}] ${b.content}`)
      .join("\n\n")
      .slice(0, 6000);
    const localText = local_signals?.length
      ? local_signals.map((s) => `- ${s.title}${s.snippet ? `: ${s.snippet}` : ""}`).join("\n")
      : "(none)";
    const communityText = community.length
      ? community.map((c) => `- r/${c.subreddit ?? "?"}: ${c.title}${c.snippet ? ` — ${c.snippet}` : ""}`).join("\n")
      : "(none)";

    const synth = await runGuarded<string>(
      {
        owner_id: user.id,
        user_id: user.id,
        provider: "lovable-ai",
        feature: "awareness.synthesis",
        query: `synth:${place_id}:${weather?.condition ?? "na"}:${community.length}`,
        cache_ttl_seconds: 15 * 60,
        related_entity_type: "awareness_place",
        related_entity_id: place_id,
      },
      async () => {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) throw new Error("LOVABLE_API_KEY not configured");
        const prompt = `Location tier: ${tier} (scope: ${tierScope || "unknown"})
Place: ${place.label}
Country: ${place.country ?? "?"} | Region: ${place.region ?? "?"} | City: ${geoCity ?? "?"}
Weather: ${weather ? `${weather.tempC}C ${weather.condition}` : "(none collected)"}

Local web/Places results:
${localText}

Community chatter (Reddit — unverified):
${communityText}

Briefings:
${briefingsText || "(none)"}

Write a 2-3 sentence operational pulse. Use only the evidence above. If tier isn't exact, say you're using broader ${tierScope || "area"} context. If no live sources fired, say so plainly. Human, warm, direct tone — no report voice, no "geospatial", no "infrastructure effectively zero".`;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: `${AWARENESS_VOICE}\n\nSnapshot mode: summarize ONLY the evidence given. Never invent local detail. Plain English, 1-3 short sentences.` },
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
      tier,
      tier_scope: tierScope,
      weather,
      summary,
      local_signals_count: local_signals?.length ?? 0,
      community_count: community.length,
      community_via: community[0]?.via ?? null,
      briefing_count: (briefings ?? []).length,
      location_warning,
      generated_at: new Date().toISOString(),
    };

    const full_data = {
      place,
      weather,
      summary,
      local_signals: local_signals ?? [],
      community,
      briefings: briefings ?? [],
      location_warning,
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
