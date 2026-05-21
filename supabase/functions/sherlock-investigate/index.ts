// sherlock-investigate: dual-mode.
// - mode="overlay": runs a structured analysis (risks / missing_info / related / contradictions /
//   assumptions / dependencies / blind_spots) over a focused scope. Caches in sherlock_findings_cache.
// - default mode: full investigation question over the user's memory (persisted to investigations).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SHERLOCK_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FULL_SYSTEM = `${SHERLOCK_VOICE}

You answer the user's question by reasoning across their own captured memory:
notes, commitments, actions, and awareness briefings provided in CONTEXT.
Be precise. Cite which item supports each claim using its kind+id like (note:abc123).
Do not invent facts. If evidence is thin, say so. Output strict JSON only.`;

const FULL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          source_kind: { type: "string", enum: ["note", "commitment", "action", "briefing", "inference"] },
          source_id: { type: "string" },
          source_excerpt: { type: "string" },
        },
        required: ["claim", "confidence", "source_kind"],
        additionalProperties: false,
      },
    },
    related_note_ids: { type: "array", items: { type: "string" } },
    related_commitment_ids: { type: "array", items: { type: "string" } },
    related_action_ids: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "findings"],
  additionalProperties: false,
};

const OVERLAY_SYSTEM = `${SHERLOCK_VOICE}

Given a focused TARGET (a note, message, action, commitment, briefing, file, or freeform text)
and recent CONTEXT from the user's memory, surface what a sharp operator would notice
that the user might miss. Be specific, not generic. No fluff. No moralizing.
Each item must be a single concrete observation, not a category restatement.
If a section has nothing real, return an empty array. Output strict JSON only.`;

const OVERLAY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One-paragraph plain-English read of the target." },
    risks: { type: "array", items: itemSchema(["severity"]) },
    missing_info: { type: "array", items: itemSchema() },
    related: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          id: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["kind", "snippet"],
        additionalProperties: false,
      },
    },
    contradictions: { type: "array", items: itemSchema() },
    assumptions: { type: "array", items: itemSchema() },
    dependencies: { type: "array", items: itemSchema() },
    blind_spots: { type: "array", items: itemSchema() },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary"],
  additionalProperties: false,
};

function itemSchema(extra: string[] = []) {
  const props: any = {
    claim: { type: "string" },
    rationale: { type: "string" },
    refs: { type: "array", items: { type: "string" } },
  };
  if (extra.includes("severity")) props.severity = { type: "string", enum: ["low", "medium", "high"] };
  return {
    type: "object",
    properties: props,
    required: ["claim"],
    additionalProperties: false,
  };
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const __authHeader = req.headers.get("Authorization") ?? "";

    const __token = __authHeader.replace("Bearer ", "");

    const { data: __claimsData } = await supabase.auth.getUser(__token);

    const user = __claimsData?.user?.id ? { id: __claimsData.user.id as string } : null;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "sherlock", _limit: 10, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const mode = body.mode === "overlay" ? "overlay" : "full";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // -------- OVERLAY MODE --------
    if (mode === "overlay") {
      const scope = body.scope ?? {};
      const entity_type: string = scope.entity_type ?? "freeform";
      const entity_id: string | null = scope.entity_id ?? null;
      const text: string = String(scope.text ?? "").slice(0, 4000);
      if (!text && !entity_id) {
        return new Response(JSON.stringify({ error: "scope.text or scope.entity_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const scopeHash = await sha256(`${entity_type}:${entity_id ?? ""}:${text}`);

      // Cache lookup (fresh < 1 hour)
      const { data: cached } = await supabase
        .from("sherlock_findings_cache")
        .select("findings, updated_at")
        .eq("user_id", user.id)
        .eq("entity_type", entity_type)
        .eq("scope_hash", scopeHash)
        .maybeSingle();
      if (cached && new Date(cached.updated_at).getTime() > Date.now() - 60 * 60 * 1000) {
        return new Response(JSON.stringify({ findings: cached.findings, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Light recent context
      const [notesRes, actsRes, commsRes] = await Promise.all([
        supabase.from("notes").select("id, title, body").order("updated_at", { ascending: false }).limit(15),
        supabase.from("actions").select("id, title, description, status, risk").order("updated_at", { ascending: false }).limit(15),
        supabase.from("commitments").select("id, summary, status, due_at").order("updated_at", { ascending: false }).limit(15),
      ]);
      const ctx = [
        ...(notesRes.data ?? []).map((n: any) => `(note:${n.id}) ${n.title ?? ""} ${String(n.body ?? "").slice(0, 240)}`),
        ...(actsRes.data ?? []).map((a: any) => `(action:${a.id}) ${a.title} [${a.status}/${a.risk}]`),
        ...(commsRes.data ?? []).map((c: any) => `(commitment:${c.id}) ${c.summary} [${c.status}${c.due_at ? `, due ${c.due_at}` : ""}]`),
      ].join("\n");

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: OVERLAY_SYSTEM },
            { role: "user", content: `TARGET (${entity_type}${entity_id ? `:${entity_id}` : ""}):\n${text}\n\nCONTEXT:\n${ctx || "(none)"}` },
          ],
          tools: [{ type: "function", function: { name: "analyze", description: "Return structured analysis.", parameters: OVERLAY_SCHEMA } }],
          tool_choice: { type: "function", function: { name: "analyze" } },
        }),
      });
      if (aiRes.status === 429 || aiRes.status === 402) {
        return new Response(JSON.stringify({ error: aiRes.status === 429 ? "rate limited" : "credits exhausted" }),
          { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!aiRes.ok) {
        const t = await aiRes.text();
        return new Response(JSON.stringify({ error: "ai gateway error", detail: t }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiJson = await aiRes.json();
      const argsStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      let findings: any = {};
      try { findings = argsStr ? JSON.parse(argsStr) : {}; } catch { findings = {}; }

      await supabase.from("sherlock_findings_cache").upsert(
        {
          user_id: user.id,
          entity_type,
          entity_id,
          scope_hash: scopeHash,
          findings,
          confidence: findings.confidence ?? null,
        },
        { onConflict: "user_id,entity_type,scope_hash" }
      );

      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "sherlock_overlay",
        entity_id: entity_id,
        event: "analyzed",
        payload: { entity_type, sections: Object.keys(findings) },
      });

      return new Response(JSON.stringify({ findings, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------- FULL INVESTIGATION MODE (legacy/compat) --------
    const { question } = body;
    if (!question || typeof question !== "string" || question.length < 3) {
      return new Response(JSON.stringify({ error: "question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inv, error: invErr } = await supabase
      .from("investigations")
      .insert({ user_id: user.id, question, status: "running" })
      .select("id")
      .single();
    if (invErr || !inv) throw invErr ?? new Error("could not create investigation");

    const q = question.slice(0, 200);
    const [notesRes, commsRes, actsRes, briefsRes] = await Promise.all([
      supabase.from("notes").select("id, title, body, tags, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("commitments").select("id, summary, due_at, status, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("actions").select("id, title, description, status, risk, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("awareness_briefings").select("id, section, content, confidence, generated_at").order("generated_at", { ascending: false }).limit(20),
    ]);

    const ctxBlocks: string[] = [];
    for (const n of notesRes.data ?? []) ctxBlocks.push(`(note:${n.id}) ${n.title ? n.title + "\n" : ""}${String(n.body ?? "").slice(0, 800)}`);
    for (const c of commsRes.data ?? []) ctxBlocks.push(`(commitment:${c.id}) ${c.summary} (status:${c.status}${c.due_at ? `, due:${c.due_at}` : ""})`);
    for (const a of actsRes.data ?? []) ctxBlocks.push(`(action:${a.id}) ${a.title}${a.description ? " — " + a.description.slice(0, 400) : ""} (status:${a.status}, risk:${a.risk})`);
    for (const b of briefsRes.data ?? []) ctxBlocks.push(`(briefing:${b.id}) ${b.section}: ${String(b.content ?? "").slice(0, 600)}`);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: FULL_SYSTEM },
          { role: "user", content: `QUESTION:\n${q}\n\nCONTEXT:\n${ctxBlocks.join("\n---\n") || "(no context yet)"}` },
        ],
        tools: [{ type: "function", function: { name: "report", description: "Return investigation report.", parameters: FULL_SCHEMA } }],
        tool_choice: { type: "function", function: { name: "report" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      await supabase.from("investigations").update({ status: "failed", error: `ai: ${aiRes.status} ${t.slice(0, 200)}` }).eq("id", inv.id);
      return new Response(JSON.stringify({ error: "ai gateway error", detail: t }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const argsStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let report: any = {};
    try { report = argsStr ? JSON.parse(argsStr) : {}; } catch { report = {}; }

    const summary: string = report.summary ?? "No summary produced.";
    const findings: any[] = Array.isArray(report.findings) ? report.findings : [];
    const isUuid = (s: any) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const relNotes = (report.related_note_ids ?? []).filter(isUuid);
    const relComms = (report.related_commitment_ids ?? []).filter(isUuid);
    const relActs = (report.related_action_ids ?? []).filter(isUuid);

    if (findings.length) {
      await supabase.from("investigation_findings").insert(
        findings.slice(0, 25).map((f: any) => ({
          investigation_id: inv.id, user_id: user.id,
          claim: String(f.claim ?? "").slice(0, 1000),
          confidence: ["low", "medium", "high"].includes(f.confidence) ? f.confidence : "medium",
          source_kind: typeof f.source_kind === "string" ? f.source_kind : null,
          source_id: isUuid(f.source_id) ? f.source_id : null,
          source_excerpt: typeof f.source_excerpt === "string" ? f.source_excerpt.slice(0, 500) : null,
        }))
      );
    }

    await supabase.from("investigations").update({
      status: "complete", summary,
      related_note_ids: relNotes, related_commitment_ids: relComms, related_action_ids: relActs,
    }).eq("id", inv.id);

    await supabase.from("audit_log").insert({
      user_id: user.id, entity_type: "investigation", entity_id: inv.id,
      event: "completed", payload: { question: q, findings_count: findings.length },
    });

    return new Response(JSON.stringify({ id: inv.id, summary, findings_count: findings.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sherlock-investigate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
