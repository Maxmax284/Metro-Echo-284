// research-run: kick off a research object (quick or deep) for a user.
// Quick mode = single SerpApi search + AI synthesis. Deep mode = up to 3 searches.
// All external calls routed through apiGuard. Deep mode additionally gated by
// system_controls.deep_research_enabled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { runGuarded, adminClient } from "../_shared/apiGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  question: z.string().min(3).max(500),
  mode: z.enum(["quick", "deep"]).default("quick"),
  related_entity_type: z.string().max(64).optional(),
  related_entity_id: z.string().uuid().optional(),
});

const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

type Source = { title: string; url: string; snippet: string; provider: string; position: number };

async function serpSearch(query: string): Promise<Source[]> {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY missing");
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("q", query);
  u.searchParams.set("engine", "google");
  u.searchParams.set("num", "5");
  u.searchParams.set("api_key", SERPAPI_KEY);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`serpapi ${r.status}`);
  const j = await r.json();
  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  return organic.slice(0, 5).map((o: any, i: number) => ({
    title: String(o?.title ?? "").slice(0, 300),
    url: String(o?.link ?? ""),
    snippet: String(o?.snippet ?? "").slice(0, 600),
    provider: "serpapi",
    position: i,
  })).filter((s: Source) => s.url);
}

async function synthesize(question: string, sources: Source[]): Promise<string> {
  if (!LOVABLE_API_KEY) return "Sources gathered. AI synthesis unavailable.";
  const ctx = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`).join("\n\n");
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "You synthesize a concise (4-7 sentence) research answer from web sources. Cite source numbers like [1]. Be factual, no speculation. If sources contradict, say so." },
      { role: "user", content: `Question: ${question}\n\nSources:\n${ctx}` },
    ],
  };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) return "AI synthesis failed; raw sources stored.";
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? "No summary produced.";
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
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { question, mode, related_entity_type, related_entity_id } = parsed.data;
    const db = adminClient();

    // Deep mode kill-switch check
    if (mode === "deep") {
      const { data: ctrl } = await db.from("system_controls")
        .select("deep_research_enabled, external_apis_enabled, global_usage_mode")
        .eq("owner_id", user.id).maybeSingle();
      if (!ctrl?.deep_research_enabled || !ctrl?.external_apis_enabled || ctrl?.global_usage_mode === "lockdown") {
        return new Response(JSON.stringify({ error: "deep_research_disabled" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create research object
    const { data: obj, error: insErr } = await db.from("research_objects").insert({
      user_id: user.id, question, mode,
      status: "running",
      related_entity_type: related_entity_type ?? null,
      related_entity_id: related_entity_id ?? null,
    }).select("id").maybeSingle();
    if (insErr || !obj) throw insErr ?? new Error("insert failed");

    const researchId = obj.id;
    const allSources: Source[] = [];
    const queries = mode === "deep" ? [question, `${question} latest`, `${question} risks`] : [question];

    try {
      for (const q of queries) {
        const res = await runGuarded(
          {
            owner_id: user.id,
            user_id: user.id,
            provider: "serpapi",
            feature: mode === "deep" ? "research.deep" : "research.quick",
            query: q,
            cache_ttl_seconds: 60 * 60 * 6,
            task_id: researchId,
            related_entity_type: "research_object",
            related_entity_id: researchId,
          },
          () => serpSearch(q),
        );
        if (!res.ok) {
          if (res.reason === "disabled" || res.reason === "lockdown") {
            await db.from("research_objects").update({
              status: "blocked", error: `blocked: ${res.reason}`, completed_at: new Date().toISOString(),
            }).eq("id", researchId);
            return new Response(JSON.stringify({ id: researchId, status: "blocked", reason: res.reason }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // rate_limited / over_task_cap: stop loop, use what we have
          break;
        }
        for (const s of res.data) {
          if (!allSources.some(x => x.url === s.url)) {
            allSources.push({ ...s, position: allSources.length });
          }
        }
      }

      const summary = allSources.length
        ? await synthesize(question, allSources)
        : "No sources retrieved.";

      if (allSources.length) {
        await db.from("research_sources").insert(
          allSources.map(s => ({
            research_id: researchId, user_id: user.id,
            title: s.title, url: s.url, snippet: s.snippet,
            provider: s.provider, position: s.position,
          })),
        );
      }

      await db.from("research_objects").update({
        status: "complete", summary, completed_at: new Date().toISOString(),
      }).eq("id", researchId);

      return new Response(JSON.stringify({ id: researchId, status: "complete", sources: allSources.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("research_objects").update({
        status: "failed", error: msg, completed_at: new Date().toISOString(),
      }).eq("id", researchId);
      return new Response(JSON.stringify({ id: researchId, status: "failed", error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
