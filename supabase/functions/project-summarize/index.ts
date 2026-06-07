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
  required: ["where_it_stands", "what_moved", "who_waiting", "open_questions", "next_move"],
  properties: {
    where_it_stands: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "bullets"],
      properties: {
        summary: { type: "string", maxLength: 320 },
        bullets: {
          type: "array",
          maxItems: 4,
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
    what_moved: { $ref: "#/$defs/block" },
    who_waiting: { $ref: "#/$defs/block" },
    open_questions: { $ref: "#/$defs/block" },
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
    block: {
      type: "object",
      additionalProperties: false,
      required: ["bullets"],
      properties: {
        bullets: {
          type: "array",
          maxItems: 5,
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
    lines.push(`- Cite sources for every bullet using the ref keys below, e.g. citations: ["note:abc12"].`);
    lines.push(`- Only state things grounded in these items. No invention.`);
    lines.push(`- "what_moved" should focus on items updated in the last 7 days.`);
    lines.push(`- "who_waiting" should surface people or open commitments waiting on someone.`);
    lines.push(`- "open_questions" should be real questions raised by the items, not generic.`);
    lines.push(`- "next_move" is one concrete next action grounded in the material.`);
    lines.push(`- ${tone === "operator" ? "Operator voice: terse, scannable." : "Narrative voice: warm, plain English. Mention people by name when they appear."}`);

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

    lines.push(`\nREF KEYS AVAILABLE: ${refs.map((r) => r.ref).join(", ")}`);

    const sys = `${VANTA_CORE_VOICE}
You write a Living Brief as 5 named blocks. Every bullet MUST cite at least one ref key from the provided list.
Citations are the ref keys exactly as given (e.g. "note:abc12345").
Never invent ref keys. If you cannot ground a bullet, omit it.
Keep bullets short and concrete. No headings inside bullets. No markdown.`;

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
      version: 1,
      tone,
      generated_at: new Date().toISOString(),
      blocks: structured,
      ref_index: refIndex,
    };

    await supabase.from("projects").update({ brief_structured: briefStruct }).eq("id", project_id);

    // Plain-text fallback for the existing summary textarea / external surfaces.
    const summary = buildPlainText(structured);

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
  if (s.where_it_stands?.summary) parts.push(s.where_it_stands.summary);
  const section = (label: string, b: any) => {
    if (!b?.bullets?.length) return;
    parts.push(`\n${label}:`);
    for (const bl of b.bullets) parts.push(`- ${bl.text}`);
  };
  section("What moved", s.what_moved);
  section("Who's waiting", s.who_waiting);
  section("Open questions", s.open_questions);
  if (s.next_move?.text) parts.push(`\nNext move: ${s.next_move.text}`);
  return parts.join("\n");
}
