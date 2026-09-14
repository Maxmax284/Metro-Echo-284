import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// sherlock-investigate: dual-mode.
// - mode="overlay": runs a structured analysis (risks / missing_info / related / contradictions /
//   assumptions / dependencies / blind_spots) over a focused scope. Caches in sherlock_findings_cache.
// - default mode: full investigation question over the user's memory (persisted to investigations).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SHERLOCK_VOICE } from "../_shared/vantaVoice.ts";
import { groundContext } from "../_shared/sherlockGround.ts";


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

// -------- EXTRACT mode (recognition only — never decides) --------
const EXTRACT_SYSTEM = `${SHERLOCK_VOICE}

You read a single capture (a message, file name, or freeform text) and pull
out the structured facts a human would want at a glance. You do NOT decide
what to do with it. You do NOT recommend medical, legal, or financial
conclusions. If a field isn't clearly present, omit it. No guessing.
Output strict JSON only.`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string" },
    summary: { type: "string" },
    people: { type: "array", items: { type: "string" } },
    places: { type: "array", items: { type: "string" } },
    orgs: { type: "array", items: { type: "string" } },
    dates: { type: "array", items: { type: "string" } },
    amounts: { type: "array", items: { type: "string" } },
    intents: { type: "array", items: { type: "string" } },
    sensitive: { type: "boolean" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "confidence"],
  additionalProperties: false,
};

// -------- SUGGEST mode (drafts a triage route — never routes) --------
const SUGGEST_SYSTEM = `${SHERLOCK_VOICE}

You look at a single capture plus recent context and propose ONE next move
for triage: where it belongs and why. You are not the operator — you are
drafting a recommendation the human will accept or reject. Be specific and
brief. Output strict JSON only.

Allowed lanes:
  - memory      (just file it — reference)
  - commitment  (an obligation to track)
  - reminder    (a poke at a specific time)
  - action      (a draft action to stage; never auto-run)
  - sherlock    (worth a deeper look first)
  - ignore      (noise, file away)`;

const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggested_route: { type: "string", enum: ["memory", "commitment", "reminder", "action", "sherlock", "ignore"] },
    title: { type: "string" },
    rationale: { type: "string" },
    due_hint: { type: "string" },
    risk: { type: "string", enum: ["low_reversible", "standard", "high"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["suggested_route", "rationale", "confidence"],
  additionalProperties: false,
};

// -------- OBSERVE mode (quick read — kind + one salient thing) --------
const OBSERVE_SYSTEM = `${SHERLOCK_VOICE}

Read this item and report what it is and one thing a sharp operator would
notice on first glance. No analysis, no recommendations, no decisions.
If nothing's notable, return salient="". Output strict JSON only.`;

const OBSERVE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", description: "What this item is (one phrase)." },
    salient: { type: "string", description: "One thing worth noticing, or empty." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["kind", "confidence"],
  additionalProperties: false,
};

// -------- RELATE mode (find connections across substrate) --------
const RELATE_SYSTEM = `${SHERLOCK_VOICE}

Given a TARGET and recent CONTEXT, find items in the user's memory that are
genuinely related — same person, same project, same place, follow-up to,
contradicts, etc. Be specific about why. Don't pad. If nothing connects,
return related=[]. Output strict JSON only.`;

const RELATE_SCHEMA = {
  type: "object",
  properties: {
    related: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["note", "commitment", "action", "briefing", "file"] },
          id: { type: "string" },
          why: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["kind", "why", "confidence"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["related", "confidence"],
  additionalProperties: false,
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callGateway(apiKey: string, system: string, userMsg: string, fnName: string, schema: any) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      tools: [{ type: "function", function: { name: fnName, description: "Return structured output.", parameters: schema } }],
      tool_choice: { type: "function", function: { name: fnName } },
    }),
  });
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
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "sherlock", _limit: 10, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const ALLOWED_MODES = ["overlay", "extract", "suggest", "observe", "relate", "full"] as const;
    const mode = (ALLOWED_MODES as readonly string[]).includes(body.mode) ? body.mode : "full";
    // Active room. Cached findings are never shared between personal and workspace.
    const orgId: string | null = typeof body.organization_id === "string" ? body.organization_id : null;
    const roomKey = orgId ?? "personal";
    const inRoom = (q: any) => (orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // -------- EXTRACT / SUGGEST / OBSERVE / RELATE MODES (capture-to-triage helpers) --------
    if (mode === "extract" || mode === "suggest" || mode === "observe" || mode === "relate") {
      const scope = body.scope ?? {};
      const entity_type: string = scope.entity_type ?? "freeform";
      const entity_id: string | null = scope.entity_id ?? null;
      const text: string = String(scope.text ?? "").slice(0, 4000);
      if (!text) {
        return new Response(JSON.stringify({ error: "scope.text required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cacheKey = `${roomKey}:${mode}:${entity_type}:${entity_id ?? ""}:${text}`;
      const scopeHash = await sha256(cacheKey);
      const cacheType = `${mode}:${entity_type}`;

      const { data: cached } = await inRoom(supabase
        .from("sherlock_findings_cache")
        .select("findings, updated_at")
        .eq("user_id", user.id)
        .eq("entity_type", cacheType)
        .eq("scope_hash", scopeHash))
        .maybeSingle();
      if (cached && new Date(cached.updated_at).getTime() > Date.now() - 60 * 60 * 1000) {
        return new Response(JSON.stringify({ findings: cached.findings, cached: true, mode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let system = EXTRACT_SYSTEM;
      let schema: any = EXTRACT_SCHEMA;
      let fnName = "extract";
      let userMsg = `CAPTURE (${entity_type}):\n${text}`;

      if (mode === "suggest") {
        system = SUGGEST_SYSTEM;
        schema = SUGGEST_SCHEMA;
        fnName = "suggest";
        const [notesRes, commsRes, ground] = await Promise.all([
          supabase.from("notes").select("id, title").order("updated_at", { ascending: false }).limit(8),
          supabase.from("commitments").select("id, summary, due_at, status").eq("status", "open").order("updated_at", { ascending: false }).limit(8),
          groundContext(supabase, user.id, orgId, { forwardDays: 14, eventLimit: 15, projectLimit: 10 }),
        ]);
        const ctx = [
          ...ground.lines,
          ...(notesRes.data ?? []).map((n: any) => `(note:${n.id}) ${n.title ?? ""}`),
          ...(commsRes.data ?? []).map((c: any) => `(commitment:${c.id}) ${c.summary}${c.due_at ? ` [due ${c.due_at}]` : ""}`),
        ].join("\n");
        userMsg = `CAPTURE (${entity_type}):\n${text}\n\nRECENT CONTEXT:\n${ctx || "(none)"}`;
      } else if (mode === "observe") {
        system = OBSERVE_SYSTEM;
        schema = OBSERVE_SCHEMA;
        fnName = "observe";
        userMsg = `ITEM (${entity_type}):\n${text}`;
      } else if (mode === "relate") {
        system = RELATE_SYSTEM;
        schema = RELATE_SCHEMA;
        fnName = "relate";
        const [notesRes, commsRes, actsRes, ground] = await Promise.all([
          supabase.from("notes").select("id, title, body").order("updated_at", { ascending: false }).limit(20),
          supabase.from("commitments").select("id, summary, status, due_at").order("updated_at", { ascending: false }).limit(20),
          supabase.from("actions").select("id, title, status").order("updated_at", { ascending: false }).limit(20),
          groundContext(supabase, user.id, orgId),
        ]);
        const ctx = [
          ...ground.lines,
          ...(notesRes.data ?? []).map((n: any) => `(note:${n.id}) ${n.title ?? ""} ${String(n.body ?? "").slice(0, 160)}`),
          ...(commsRes.data ?? []).map((c: any) => `(commitment:${c.id}) ${c.summary} [${c.status}${c.due_at ? `, due ${c.due_at}` : ""}]`),
          ...(actsRes.data ?? []).map((a: any) => `(action:${a.id}) ${a.title} [${a.status}]`),
        ].join("\n");
        userMsg = `TARGET (${entity_type}${entity_id ? `:${entity_id}` : ""}):\n${text}\n\nCONTEXT:\n${ctx || "(none)"}`;
      }


      const aiRes = await callGateway(LOVABLE_API_KEY, system, userMsg, fnName, schema);
      if (aiRes.status === 429 || aiRes.status === 402) {
        return new Response(JSON.stringify({ error: aiRes.status === 429 ? "rate limited" : "credits exhausted" }),
          { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!aiRes.ok) {
        const t = await aiRes.text();
        return new Response(JSON.stringify({ error: "ai gateway error", detail: t.slice(0, 400) }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiJson = await aiRes.json();
      const argsStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      let findings: any = {};
      try { findings = argsStr ? JSON.parse(argsStr) : {}; } catch { findings = {}; }

      await supabase.from("sherlock_findings_cache").upsert({
        user_id: user.id,
        organization_id: orgId,
        entity_type: cacheType,
        entity_id,
        scope_hash: scopeHash,
        findings,
        confidence: findings.confidence ?? null,
      }, { onConflict: "user_id,entity_type,scope_hash" });

      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: `sherlock_${mode}`,
        entity_id,
        event: "analyzed",
        payload: { entity_type, mode, has_suggestion: mode === "suggest" ? !!findings.suggested_route : undefined },
      });

      return new Response(JSON.stringify({ findings, cached: false, mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


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

      const scopeHash = await sha256(`${roomKey}:${entity_type}:${entity_id ?? ""}:${text}`);

      // Cache lookup (fresh < 1 hour)
      const { data: cached } = await inRoom(supabase
        .from("sherlock_findings_cache")
        .select("findings, updated_at")
        .eq("user_id", user.id)
        .eq("entity_type", entity_type)
        .eq("scope_hash", scopeHash))
        .maybeSingle();
      if (cached && new Date(cached.updated_at).getTime() > Date.now() - 60 * 60 * 1000) {
        return new Response(JSON.stringify({ findings: cached.findings, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Light recent context, on top of the real calendar and projects
      const [notesRes, actsRes, commsRes, ground] = await Promise.all([
        supabase.from("notes").select("id, title, body").order("updated_at", { ascending: false }).limit(15),
        supabase.from("actions").select("id, title, description, status, risk").order("updated_at", { ascending: false }).limit(15),
        supabase.from("commitments").select("id, summary, status, due_at").order("updated_at", { ascending: false }).limit(15),
        groundContext(supabase, user.id, orgId),
      ]);
      const ctx = [
        ...ground.lines,
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
          organization_id: orgId,
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
    const [notesRes, commsRes, actsRes, briefsRes, ground] = await Promise.all([
      supabase.from("notes").select("id, title, body, tags, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("commitments").select("id, summary, due_at, status, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("actions").select("id, title, description, status, risk, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("awareness_briefings").select("id, section, content, confidence, generated_at").order("generated_at", { ascending: false }).limit(20),
      groundContext(supabase, user.id, orgId, { backDays: 7, forwardDays: 30 }),
    ]);

    const ctxBlocks: string[] = [];
    for (const line of ground.lines) ctxBlocks.push(line);
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
