// research-run: kick off a research object (quick or deep) for a user.
// Quick mode = single SerpApi search + AI synthesis. Deep mode = up to 3 searches.
// All external calls routed through apiGuard. Deep mode additionally gated by
// system_controls.deep_research_enabled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { runGuarded, adminClient } from "../_shared/apiGuard.ts";
import { RESEARCH_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  question: z.string().min(3).max(500),
  mode: z.enum(["quick", "deep"]).default("quick"),
  related_entity_type: z.string().max(64).optional(),
  related_entity_id: z.string().uuid().optional(),
  // Phase 4 — when present, an approved research run produces a
  // plain-English Research Brief attached to this project.
  project_id: z.string().uuid().optional(),
  // Optional plain-English reason that surfaced the chip ("Ground Stay has
  // repeated notes about deposits"). Stored on the receipt so audit shows
  // *why* this research ran.
  trigger_reason: z.string().max(280).optional(),
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
      { role: "system", content: RESEARCH_VOICE },
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
    const __authHeader = req.headers.get("Authorization") ?? "";

    const __token = __authHeader.replace("Bearer ", "");

    const { data: __claimsData } = await userClient.auth.getUser(__token);

    const user = __claimsData?.user?.id ? { id: __claimsData.user.id as string } : null;
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
    const { question, mode, related_entity_type, related_entity_id, project_id, trigger_reason } = parsed.data;
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

      // Phase 4 — attach a plain-English Research Brief to the project.
      let briefExportId: string | null = null;
      if (project_id && allSources.length > 0) {
        try {
          // Confirm the project belongs to this user before attaching.
          const { data: proj } = await db.from("projects")
            .select("id, title, organization_id")
            .eq("id", project_id).eq("user_id", user.id).maybeSingle();
          if (proj) {
            const briefDoc = composeResearchBrief({
              project_title: proj.title ?? "this project",
              question,
              summary,
              sources: allSources,
              trigger_reason,
              research_id: researchId,
            });
            const { data: be } = await db.from("brief_exports").insert({
              user_id: user.id,
              organization_id: proj.organization_id ?? null,
              project_id: proj.id,
              format: "research_brief",
              scope_kind: "project",
              title: briefDoc.title,
              subtitle: briefDoc.subtitle,
              brief: briefDoc,
              status: "draft",
            }).select("id").maybeSingle();
            briefExportId = be?.id ?? null;

            // Receipt — what was researched, why, what triggered it, sources, when.
            await db.from("audit_log").insert({
              user_id: user.id,
              entity_type: "project",
              entity_id: proj.id,
              event: "research.brief_created",
              payload: {
                project_id: proj.id,
                project_title: proj.title,
                research_id: researchId,
                brief_export_id: briefExportId,
                question,
                sources: allSources.length,
                trigger_reason: trigger_reason ?? null,
                triggered_by_entity_type: related_entity_type ?? null,
                triggered_by_entity_id: related_entity_id ?? null,
                approved_at: new Date().toISOString(),
              },
            });
          }
        } catch (e) {
          // Don't fail the research call if brief attach hits an issue.
          console.error("[research-run] brief attach failed", e);
        }
      }

      return new Response(JSON.stringify({
        id: researchId,
        status: "complete",
        sources: allSources.length,
        brief_export_id: briefExportId,
      }), {
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

// ---------------------------------------------------------------------------
// Phase 4 — Research Brief composition.
// Plain-English structured brief written into brief_exports.brief so the
// Living Brief, Saved exports list, and future export polish can render it
// without a new table or new edge function.
// ---------------------------------------------------------------------------

type ResearchBriefSection = { id: string; heading: string; body: string };
type ResearchBriefDoc = {
  kind: "research_brief";
  title: string;
  subtitle: string;
  format: "research_brief";
  scope_kind: "project";
  generated_at: string;
  question: string;
  trigger_reason: string | null;
  research_id: string;
  sections: ResearchBriefSection[];
  sources: Array<{ position: number; title: string; url: string; snippet: string; provider: string }>;
};

function composeResearchBrief(args: {
  project_title: string;
  question: string;
  summary: string;
  sources: Source[];
  trigger_reason?: string | null;
  research_id: string;
}): ResearchBriefDoc {
  const { project_title, question, summary, sources, trigger_reason, research_id } = args;
  const summaryText = (summary && summary.trim()) || "No summary was produced.";

  // Split the AI synthesis into the briefest plain-English shape we can.
  // We do not over-parse — a single "Key findings" block beats a wrong split.
  const sections: ResearchBriefSection[] = [
    {
      id: "what_vanta_looked_into",
      heading: "What Vanta looked into",
      body: question,
    },
    {
      id: "why_it_matters",
      heading: "Why it matters",
      body: trigger_reason
        ? trigger_reason
        : `${project_title} surfaced a recurring question worth checking outside context for.`,
    },
    {
      id: "key_findings",
      heading: "Key findings",
      body: summaryText,
    },
    {
      id: "what_this_means",
      heading: `What this means for ${project_title}`,
      body: sources.length
        ? `Outside examples were saved. Review them alongside the Living Brief to decide what to apply.`
        : `No usable outside sources were found this run. Try a more specific question.`,
    },
    {
      id: "questions_or_cautions",
      heading: "Questions or cautions",
      body: `These sources are starting points, not legal or financial guarantees. Cross-check anything you act on.`,
    },
    {
      id: "suggested_next_move",
      heading: "Suggested next move",
      body: `Open the sources, pick what fits ${project_title}, and capture decisions back into the Living Brief.`,
    },
  ];

  const shortQ = question.length > 60 ? question.slice(0, 57).trimEnd() + "…" : question;
  return {
    kind: "research_brief",
    title: `Research brief: ${shortQ}`,
    subtitle: `Outside context for ${project_title}`,
    format: "research_brief",
    scope_kind: "project",
    generated_at: new Date().toISOString(),
    question,
    trigger_reason: trigger_reason ?? null,
    research_id,
    sections,
    sources: sources.map((s) => ({
      position: s.position,
      title: s.title,
      url: s.url,
      snippet: s.snippet,
      provider: s.provider,
    })),
  };
}
