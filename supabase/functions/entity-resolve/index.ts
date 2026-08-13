import { corsHeaders } from "../_shared/http.ts";
// entity-resolve — semantic + (optional) LLM disambiguation pass that runs on
// top of the rule-based linkEntities. Doctrine: capture never executes.
// This function only *suggests* entity/project assignments and (when a
// source row is provided) writes idempotent entity_links rows + an audit
// receipt. Nothing else moves.
//
// Body: {
//   text: string,
//   source_kind?: EntitySourceKind,   // when present, persist links
//   source_id?: uuid,
//   role?: "mentions" | "about" | ...,
//   match_count?: number,             // default 8
//   min_similarity?: number,          // default 0.62
//   llm_disambiguate?: boolean        // default true when top-2 within 0.05
// }
//
// Returns: { matches: [...], project_id, project_confidence, why, linked }
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";


const Body = z.object({
  text: z.string().min(1).max(16000),
  source_kind: z.enum([
    "note","commitment","message","signal","field_note",
    "research_object","ingested_file","reminder","action","investigation",
  ]).optional(),
  source_id: z.string().uuid().optional(),
  role: z.enum(["mentions","about","owner","location","participant","source"]).default("mentions"),
  match_count: z.number().int().min(1).max(20).default(8),
  min_similarity: z.number().min(0).max(1).default(0.62),
  llm_disambiguate: z.boolean().default(true),
});

type Match = {
  id: string;
  display_name: string;
  kind: string;
  parent_entity_id: string | null;
  slug: string | null;
  similarity: number;
};

async function embed(text: string, apiKey: string): Promise<number[]> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!r.ok) throw new Error(`embedding: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data?.[0]?.embedding ?? [];
}

async function llmPick(
  text: string,
  shortlist: Match[],
  apiKey: string,
): Promise<{ id: string; why: string } | null> {
  // Cheap tiebreak — only fires when scores are within 0.05 of each other.
  const sys = "You disambiguate which user-known entity a short capture is most about. Choose exactly one id from the shortlist. If none clearly fit, return null.";
  const user = `Capture:\n"""${text.slice(0, 2000)}"""\n\nShortlist (id · kind · name):\n${shortlist.map((m) => `${m.id} · ${m.kind} · ${m.display_name}`).join("\n")}\n\nReturn JSON: {"id": "<uuid|null>", "why": "<one sentence>"}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) return null;
  try {
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (!parsed?.id || parsed.id === "null") return null;
    if (!shortlist.find((m) => m.id === parsed.id)) return null;
    return { id: parsed.id as string, why: String(parsed.why ?? "") };
  } catch { return null; }
}

async function resolveProject(
  sb: SupabaseClient,
  userId: string,
  match: Match,
): Promise<{ id: string; name: string } | null> {
  if (match.kind === "project") return { id: match.id, name: match.display_name };
  // Walk parent chain up to depth 3.
  let cur: { id: string; parent_entity_id: string | null } | null = {
    id: match.id, parent_entity_id: match.parent_entity_id,
  };
  for (let i = 0; i < 3 && cur?.parent_entity_id; i++) {
    const { data } = await sb
      .from("entities")
      .select("id, display_name, kind, parent_entity_id, user_id")
      .eq("id", cur.parent_entity_id)
      .maybeSingle();
    if (!data || (data as { user_id: string }).user_id !== userId) return null;
    if ((data as { kind: string }).kind === "project") {
      return { id: data.id as string, name: (data as { display_name: string }).display_name };
    }
    cur = { id: data.id as string, parent_entity_id: (data as { parent_entity_id: string | null }).parent_entity_id };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { text, source_kind, source_id, role, match_count, min_similarity, llm_disambiguate } = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: who } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = who?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. embed
    const vec = await embed(text, apiKey);

    // 2. semantic match
    const { data: matchData, error: matchErr } = await sb.rpc("entities_semantic_match", {
      _user_id: userId,
      _query_embedding: vec as unknown as string,
      _match_count: match_count,
      _min_similarity: min_similarity,
      _kinds: null,
    });
    if (matchErr) throw matchErr;
    const matches = (matchData ?? []) as Match[];

    // 3. project resolution (kind=project or via parent walk)
    let projectId: string | null = null;
    let projectName: string | null = null;
    let projectConfidence: "low" | "medium" | "high" = "low";
    let why = "";
    if (matches.length > 0) {
      const top = matches[0];
      const second = matches[1];
      let chosen: Match = top;

      if (llm_disambiguate && second && top.similarity - second.similarity < 0.05) {
        const shortlist = matches.slice(0, 4);
        const picked = await llmPick(text, shortlist, apiKey);
        if (picked) {
          const found = shortlist.find((m) => m.id === picked.id);
          if (found) { chosen = found; why = picked.why; }
        }
      }
      if (!why) why = `Similarity ${chosen.similarity.toFixed(2)} to "${chosen.display_name}".`;

      const proj = await resolveProject(sb, userId, chosen);
      if (proj) {
        projectId = proj.id;
        projectName = proj.name;
        projectConfidence = chosen.similarity >= 0.78 ? "high" : chosen.similarity >= 0.68 ? "medium" : "low";
      }
    }

    // 4. persist links if a source was given (idempotent)
    let linked = 0;
    if (source_kind && source_id && matches.length > 0) {
      const rows = matches
        .filter((m) => m.similarity >= min_similarity)
        .map((m) => ({
          user_id: userId,
          entity_id: m.id,
          source_kind,
          source_id,
          role,
          confidence: (m.similarity >= 0.78 ? "high" : m.similarity >= 0.68 ? "medium" : "low") as "high"|"medium"|"low",
          metadata: { via: "entity-resolve", similarity: Number(m.similarity.toFixed(3)) },
        }));
      if (rows.length > 0) {
        const { error: upErr } = await sb.from("entity_links").upsert(rows, {
          onConflict: "source_kind,source_id,entity_id,role",
          ignoreDuplicates: true,
        });
        if (!upErr) linked = rows.length;
      }
      await sb.from("audit_log").insert({
        user_id: userId,
        entity_type: "entity_graph",
        event: "entity.resolved",
        payload: {
          source_kind, source_id,
          matches: matches.length,
          project_id: projectId,
          project_confidence: projectConfidence,
          top_similarity: matches[0]?.similarity ?? null,
        },
      });
    }

    return new Response(JSON.stringify({
      matches: matches.map((m) => ({
        id: m.id, display_name: m.display_name, kind: m.kind,
        slug: m.slug, similarity: Number(m.similarity.toFixed(3)),
        parent_entity_id: m.parent_entity_id,
      })),
      project_id: projectId,
      project_name: projectName,
      project_confidence: projectConfidence,
      why,
      linked,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
