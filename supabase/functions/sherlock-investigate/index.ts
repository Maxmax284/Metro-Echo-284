// sherlock-investigate: runs an AI investigation across the user's memory,
// commitments, actions, and awareness briefings. Persists structured findings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Sherlock — Vanta's investigator.
You answer the user's question by reasoning across their own captured memory:
notes, commitments, actions, and awareness briefings provided in CONTEXT.
Be precise. Cite which item supports each claim using its kind+id like (note:abc123).
Do not invent facts. If evidence is thin, say so. Output strict JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Direct answer in 2–5 sentences." },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.length < 3) {
      return new Response(JSON.stringify({ error: "question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create investigation row
    const { data: inv, error: invErr } = await supabase
      .from("investigations")
      .insert({ user_id: user.id, question, status: "running" })
      .select("id")
      .single();
    if (invErr || !inv) throw invErr ?? new Error("could not create investigation");

    // Gather evidence (recent + lexical match). Cap each list to keep token budget sane.
    const q = question.slice(0, 200);
    const [notesRes, commsRes, actsRes, briefsRes] = await Promise.all([
      supabase.from("notes").select("id, title, body, tags, updated_at")
        .order("updated_at", { ascending: false }).limit(40),
      supabase.from("commitments").select("id, summary, due_at, status, updated_at")
        .order("updated_at", { ascending: false }).limit(40),
      supabase.from("actions").select("id, title, description, status, risk, updated_at")
        .order("updated_at", { ascending: false }).limit(40),
      supabase.from("awareness_briefings").select("id, section, content, confidence, generated_at")
        .order("generated_at", { ascending: false }).limit(20),
    ]);

    const notes = (notesRes.data ?? []).map((n: any) => ({
      kind: "note", id: n.id,
      text: `${n.title ? n.title + "\n" : ""}${(n.body ?? "").slice(0, 800)}`,
      tags: n.tags,
    }));
    const commitments = (commsRes.data ?? []).map((c: any) => ({
      kind: "commitment", id: c.id,
      text: `${c.summary} (status:${c.status}${c.due_at ? `, due:${c.due_at}` : ""})`,
    }));
    const actions = (actsRes.data ?? []).map((a: any) => ({
      kind: "action", id: a.id,
      text: `${a.title}${a.description ? " — " + a.description.slice(0, 400) : ""} (status:${a.status}, risk:${a.risk})`,
    }));
    const briefings = (briefsRes.data ?? []).map((b: any) => ({
      kind: "briefing", id: b.id,
      text: `${b.section}: ${(b.content ?? "").slice(0, 600)}`,
    }));

    const context = [...notes, ...commitments, ...actions, ...briefings]
      .map((x) => `(${x.kind}:${x.id}) ${x.text}`)
      .join("\n---\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `QUESTION:\n${q}\n\nCONTEXT:\n${context || "(no context yet)"}` },
        ],
        tools: [{
          type: "function",
          function: { name: "report", description: "Return investigation report.", parameters: SCHEMA },
        }],
        tool_choice: { type: "function", function: { name: "report" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      await supabase.from("investigations").update({ status: "failed", error: `ai: ${aiRes.status} ${t.slice(0, 200)}` }).eq("id", inv.id);
      return new Response(JSON.stringify({ error: "ai gateway error", detail: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          investigation_id: inv.id,
          user_id: user.id,
          claim: String(f.claim ?? "").slice(0, 1000),
          confidence: ["low", "medium", "high"].includes(f.confidence) ? f.confidence : "medium",
          source_kind: typeof f.source_kind === "string" ? f.source_kind : null,
          source_id: isUuid(f.source_id) ? f.source_id : null,
          source_excerpt: typeof f.source_excerpt === "string" ? f.source_excerpt.slice(0, 500) : null,
        }))
      );
    }

    await supabase.from("investigations").update({
      status: "complete",
      summary,
      related_note_ids: relNotes,
      related_commitment_ids: relComms,
      related_action_ids: relActs,
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
