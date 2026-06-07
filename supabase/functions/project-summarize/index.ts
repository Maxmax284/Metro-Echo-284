// project-summarize: build a structured Living Brief from a project's attached items.
// Returns 5 named blocks (where_it_stands, what_moved, who_waiting, open_questions, next_move),
// each with bullet-level citations back to source captures/notes/files/findings/commitments/actions.
// Lazy-digests any undigested captures/notes first so the model gets pre-chewed input.
// Writes the structured brief to projects.brief_structured and emits a project.summarized audit event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  project_id: z.string().uuid(),
  tone: z.enum(["operator", "narrative"]).default("narrative"),
});

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overall_summary", "situation", "key_topics", "decisions", "risks", "next_move"],
  properties: {
    overall_summary: {
      type: "object",
      additionalProperties: false,
      required: ["text", "citations"],
      properties: {
        text: { type: "string", maxLength: 900 },
        citations: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
    },
    situation: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", maxLength: 700 },
      },
    },
    key_topics: {
      type: "object",
      additionalProperties: false,
      required: ["themes"],
      properties: {
        themes: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "citations"],
            properties: {
              title: { type: "string", maxLength: 60 },
              summary: { type: "string", maxLength: 280 },
              citations: { type: "array", items: { type: "string" }, maxItems: 6 },
            },
          },
        },
      },
    },
    decisions: { $ref: "#/$defs/bulletBlock" },
    risks: { $ref: "#/$defs/bulletBlock" },
    next_move: {
      type: "object",
      additionalProperties: false,
      required: ["text", "citations"],
      properties: {
        text: { type: "string", maxLength: 240 },
        citations: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
    },
  },
  $defs: {
    bulletBlock: {
      type: "object",
      additionalProperties: false,
      required: ["bullets"],
      properties: {
        bullets: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "citations"],
            properties: {
              text: { type: "string", maxLength: 220 },
              citations: { type: "array", items: { type: "string" }, maxItems: 4 },
            },
          },
        },
      },
    },
  },
} as const;


async function lazyDigest(supabase: any, apiKey: string, items: Array<{ kind: "capture"|"note"; id: string; text: string; existing: any }>) {
  const SYS = `${VANTA_CORE_VOICE}
You read one short capture or note and return a tiny digest.
intent: ask | update | decision | vent | info | task
gist: one plain sentence under 25 words.
entities: people/places/projects mentioned (max 8). Skip if none.
dates: explicit date/time references (verbatim). Skip if none.
waiting_on: who/what is blocking, if obvious. Else empty string.
Do not invent.`;
  const DIGEST_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["intent", "gist"],
    properties: {
      intent: { type: "string", enum: ["ask", "update", "decision", "vent", "info", "task"] },
      gist: { type: "string", maxLength: 180 },
      entities: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 8 },
      dates: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 4 },
      waiting_on: { type: "string", maxLength: 80 },
    },
  };
  await Promise.all(items.map(async (it) => {
    if (it.existing) return;
    if (!it.text || it.text.trim().length < 3) return;
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "system", content: SYS }, { role: "user", content: it.text.slice(0, 4000) }],
          response_format: { type: "json_schema", json_schema: { name: "digest", strict: true, schema: DIGEST_SCHEMA } },
        }),
      });
      if (!r.ok) return;
      const j = await r.json();
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      const d = JSON.parse(raw);
      const table = it.kind === "note" ? "notes" : "messages";
      await supabase.from(table).update({ digest: d }).eq("id", it.id);
      it.existing = d;
    } catch (e) {
      console.error("[summarize:lazyDigest] failed", it.id, e);
    }
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const user = claims?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { project_id, tone } = parsed.data;

    const { data: project, error: pErr } = await supabase
      .from("projects").select("*").eq("id", project_id).maybeSingle();
    if (pErr) throw pErr;
    if (!project) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabase
      .from("project_items").select("*").eq("project_id", project_id);

    const byType: Record<string, string[]> = { capture: [], note: [], file: [], finding: [], commitment: [], action: [] };
    for (const it of items ?? []) byType[it.item_type as string]?.push(it.item_id);

    const [notes, captures, files, findings, commitments, actions] = await Promise.all([
      byType.note.length ? supabase.from("notes").select("id,title,body,updated_at,digest").in("id", byType.note) : Promise.resolve({ data: [] as any[] }),
      byType.capture.length ? supabase.from("messages").select("id,content,created_at,digest").in("id", byType.capture) : Promise.resolve({ data: [] as any[] }),
      byType.file.length ? supabase.from("ingested_files").select("id,filename,extracted_text,created_at").in("id", byType.file) : Promise.resolve({ data: [] as any[] }),
      byType.finding.length ? supabase.from("sherlock_findings").select("id,finding_type,summary,status,created_at").in("id", byType.finding) : Promise.resolve({ data: [] as any[] }),
      byType.commitment.length ? supabase.from("commitments").select("id,summary,status,due_at,updated_at").in("id", byType.commitment) : Promise.resolve({ data: [] as any[] }),
      byType.action.length ? supabase.from("actions").select("id,title,status,risk,updated_at").in("id", byType.action) : Promise.resolve({ data: [] as any[] }),
    ]);

    const totalCount = (items ?? []).length;
    if (totalCount === 0) {
      return new Response(JSON.stringify({ structured: null, empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Lazy-digest captures/notes that don't have one yet (bounded so the call stays cheap).
    const toDigest: Array<{ kind: "capture"|"note"; id: string; text: string; existing: any }> = [
      ...((notes.data ?? []) as any[]).slice(0, 20).map((n) => ({ kind: "note" as const, id: n.id, text: `${n.title ? n.title + "\n" : ""}${n.body ?? ""}`, existing: n.digest })),
      ...((captures.data ?? []) as any[]).slice(0, 20).map((c) => ({ kind: "capture" as const, id: c.id, text: c.content ?? "", existing: c.digest })),
    ];
    await lazyDigest(supabase, LOVABLE_API_KEY, toDigest);
    const digestById = new Map(toDigest.map((t) => [t.id, t.existing]));

    // Build a compact, citation-ready context. Each item gets a stable ref key.
    const refs: Array<{ ref: string; kind: string; id: string; label: string }> = [];
    const lines: string[] = [];
    lines.push(`PROJECT: ${project.title}`);
    if (project.summary) lines.push(`CURRENT BRIEF: ${project.summary}`);
    lines.push(`\nINSTRUCTIONS:`);
    lines.push(`- You are writing as an operations coordinator who has read every attached item.`);
    lines.push(`- Summarize SITUATIONS, not objects. Never enumerate captures one by one.`);
    lines.push(`- "overall_summary.text" comes FIRST. One coherent paragraph (3–6 sentences) explaining what ALL attached material means together — the big picture. Synthesis voice: "X is currently in a Y phase. The main work centers on…". Cite at least 3 distinct ref keys spanning ≥2 item kinds when material allows. Never list items one-by-one. Never name how many notes/files/etc. exist.`);
    lines.push(`- "situation.text" is one plain-English paragraph (3–6 sentences) describing what is actually going on right now across all items, as one coherent picture. No bullet lists, no headings. Do not repeat overall_summary verbatim — situation is current state, overall_summary is the meaning.`);
    lines.push(`- "key_topics.themes" groups related items into 2–6 themes. Title is short (e.g. "Booking & Payments", "Calendar & Availability"). Summary is 1–2 sentences explaining the theme. A theme should cover ≥2 items unless one item is clearly its own topic.`);
    lines.push(`- "decisions.bullets" lists things that sound settled or established as requirements. State them as facts (e.g. "Bookings default to a 20% deposit."). Omit if nothing qualifies.`);
    lines.push(`- "risks.bullets" lists real unresolved questions, ambiguity, or things flagged for review. Include open findings here, but do NOT mention "Sherlock", "findings", "signals", or any internal tooling by name — just describe the question.`);
    lines.push(`- "next_move.text" is one concrete operational next step grounded in the material.`);
    lines.push(`- Cite sources on overall_summary, every theme, every bullet, and next_move using the ref keys below, e.g. citations: ["note:abc12345"]. Never invent ref keys.`);
    lines.push(`- VOICE: plain English, calm, useful, operational. Not corporate. Not robotic. Preferred phrasings: "Vanta noticed…", "Several items point to…", "The main pattern is…".`);
    lines.push(`- BANNED PHRASES: "filed", "notes have been captured", "items have been formally recorded", "record was created", "database", "logged in the system", "Sherlock", "the system detected", "based on the data", "we have N notes". Say what is happening instead.`);
    lines.push(`- ${tone === "operator" ? "Slightly terser, scannable phrasing." : "Warm, plain English. Mention people by name when they appear."}`);

    const push = (kind: string, id: string, label: string, body: string) => {
      const ref = `${kind}:${id.slice(0, 8)}`;
      refs.push({ ref, kind, id, label });
      lines.push(`\n[${ref}] (${kind}) ${label}\n${body}`);
    };

    for (const n of (notes.data ?? []) as any[]) {
      const d = digestById.get(n.id) ?? n.digest;
      const body = d?.gist ? `gist: ${d.gist}\n${d.entities?.length ? `entities: ${d.entities.join(", ")}\n` : ""}${d.waiting_on ? `waiting_on: ${d.waiting_on}\n` : ""}body: ${(n.body ?? "").slice(0, 500)}` : (n.body ?? "").slice(0, 500);
      push("note", n.id, n.title ?? "Untitled note", body);
    }
    for (const c of (captures.data ?? []) as any[]) {
      const d = digestById.get(c.id) ?? c.digest;
      const body = d?.gist ? `gist: ${d.gist}\nintent: ${d.intent}\n${d.entities?.length ? `entities: ${d.entities.join(", ")}\n` : ""}${d.waiting_on ? `waiting_on: ${d.waiting_on}\n` : ""}raw: ${(c.content ?? "").slice(0, 400)}` : (c.content ?? "").slice(0, 400);
      push("capture", c.id, (c.content ?? "").slice(0, 60) || "Capture", body);
    }
    for (const f of (files.data ?? []) as any[]) {
      push("file", f.id, f.filename, (f.extracted_text ?? "").slice(0, 400));
    }
    for (const s of (findings.data ?? []) as any[]) {
      push("finding", s.id, `${s.finding_type ?? "finding"} (${s.status})`, s.summary ?? "");
    }
    for (const cm of (commitments.data ?? []) as any[]) {
      push("commitment", cm.id, cm.summary, `status: ${cm.status}${cm.due_at ? `, due ${cm.due_at}` : ""}`);
    }
    for (const a of (actions.data ?? []) as any[]) {
      push("action", a.id, a.title, `status: ${a.status}${a.risk ? `, ${a.risk} risk` : ""}`);
    }

    // Background patterns — Sherlock signals + recent project activity + last briefs.
    // Used by the model to detect repetition/contradictions/themes. Never surfaced by name.
    const [sherlockCache, recentAudit, lastExports] = await Promise.all([
      supabase.from("sherlock_findings_cache")
        .select("finding_type,summary,confidence,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
      supabase.from("audit_log")
        .select("event,created_at,payload")
        .eq("entity_type", "project").eq("entity_id", project_id)
        .order("created_at", { ascending: false }).limit(25),
      supabase.from("brief_exports")
        .select("title,created_at,brief")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false }).limit(2),
    ]);
    const bgLines: string[] = [];
    for (const s of (sherlockCache.data ?? []) as any[]) {
      bgLines.push(`pattern: ${s.finding_type ?? "signal"} — ${s.summary ?? ""}`);
    }
    for (const a of (recentAudit.data ?? []) as any[]) {
      bgLines.push(`timeline: ${a.created_at?.slice(0, 19).replace("T", " ")} ${a.event}`);
    }
    for (const e of (lastExports.data ?? []) as any[]) {
      const prev = e.brief?.grounding?.structured?.overall_summary?.text
        ?? e.brief?.grounding?.structured?.situation?.text
        ?? "";
      if (prev) bgLines.push(`prior_brief (${e.created_at?.slice(0, 10)}): ${prev.slice(0, 280)}`);
    }
    if (bgLines.length) {
      lines.push(`\nBACKGROUND PATTERNS (for your understanding only — do not name these sources, do not cite them):`);
      lines.push(bgLines.join("\n"));
    }

    lines.push(`\nREF KEYS AVAILABLE: ${refs.map((r) => r.ref).join(", ")}`);

    const sys = `${VANTA_CORE_VOICE}
You write a Living Brief as an operations coordinator explaining a project in plain English.
Output 7 sections: overall_summary (paragraph — the big picture meaning), situation (paragraph — current state), key_topics (themed groups), decisions, risks, next_move.
overall_summary comes first and explains what ALL the material means together. situation is current state.
Summarize situations, not objects. Never list captures one by one. Group related items into themes.
Every theme, bullet, overall_summary, and next_move MUST cite at least one ref key from the provided list (exactly as given).
Never invent ref keys. If you cannot ground something, omit it.
Never mention internal tooling ("Sherlock", "findings", "captures", "the database", "filed", "the system detected"). Describe what is happening.
No markdown. No headings inside text fields.`;


    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: lines.join("\n") },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "living_brief", strict: true, schema: BRIEF_SCHEMA },
        },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`ai gateway ${r.status}`);
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    let structured: any = null;
    try { structured = JSON.parse(raw); } catch { /* fall through */ }

    if (!structured) throw new Error("model did not return structured brief");

    const refIndex = Object.fromEntries(refs.map((r) => [r.ref, { kind: r.kind, id: r.id, label: r.label }]));
    const briefStruct = {
      version: 2,
      tone,
      generated_at: new Date().toISOString(),
      blocks: structured,
      ref_index: refIndex,
    };


    await supabase.from("projects").update({ brief_structured: briefStruct }).eq("id", project_id);

    // Plain-text fallback for the existing summary textarea / external surfaces.
    const summary = buildPlainText(structured);

    // Mirror this Living Brief into brief_exports so it shows up in the
    // project's Past Briefs list and the global Briefs/Receipts history.
    // No PDF — storage_path stays null. Status "exported" because the user
    // tapped Summarize, which is the project equivalent of approve-and-export.
    const nowIso = new Date().toISOString();
    const exportTitle = `${project.title} — Living Brief`;
    const exportBrief = {
      title: exportTitle,
      subtitle: null,
      sections: [],
      appendix_receipts: [],
      grounding: { project_id, refs: refIndex, structured },
      signals_hash: "",
      format: tone === "operator" ? "operator" : "operator",
      scope_kind: "project",
      project_id,
      generated_at: nowIso,
    };
    const { data: exportRow, error: exportErr } = await supabase
      .from("brief_exports")
      .insert({
        user_id: user.id,
        organization_id: project.organization_id ?? null,
        project_id,
        entity_id: null,
        format: "operator",
        scope_kind: "project",
        title: exportTitle,
        subtitle: null,
        brief: exportBrief,
        signals_hash: null,
        status: "exported",
        approved_at: nowIso,
        exported_at: nowIso,
      } as any)
      .select("id")
      .single();
    if (exportErr) console.error("[project-summarize] brief_exports insert failed", exportErr);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "project",
      entity_id: project_id,
      event: "project.summarized",
      payload: {
        item_count: totalCount,
        ref_count: refs.length,
        tone,
        structured: true,
        brief_export_id: exportRow?.id ?? null,
      },
    });

    return new Response(JSON.stringify({ structured: briefStruct, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[project-summarize]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildPlainText(s: any): string {
  const parts: string[] = [];
  if (s?.overall_summary?.text) parts.push(`Overall: ${s.overall_summary.text}`);
  if (s?.situation?.text) parts.push(s.situation.text);
  if (s?.key_topics?.themes?.length) {
    parts.push(`\nKey topics:`);
    for (const t of s.key_topics.themes) {
      parts.push(`- ${t.title}: ${t.summary}`);
    }
  }
  const bulletSection = (label: string, b: any) => {
    if (!b?.bullets?.length) return;
    parts.push(`\n${label}:`);
    for (const bl of b.bullets) parts.push(`- ${bl.text}`);
  };
  bulletSection("Decisions", s?.decisions);
  bulletSection("Risks / questions", s?.risks);
  if (s?.next_move?.text) parts.push(`\nNext move: ${s.next_move.text}`);
  return parts.join("\n");
}

