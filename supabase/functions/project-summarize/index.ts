// project-summarize: synthesize a "living brief" summary for a project from its
// attached notes, captures, files, findings, commitments, and actions.
// User-tap only. Writes an audit event. Returns plain markdown text.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({ project_id: z.string().uuid() });

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
    const { project_id } = parsed.data;

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

    const byType: Record<string, string[]> = {
      capture: [], note: [], file: [], finding: [], commitment: [], action: [],
    };
    for (const it of items ?? []) byType[it.item_type as string]?.push(it.item_id);

    const [notes, captures, files, findings, commitments, actions] = await Promise.all([
      byType.note.length
        ? supabase.from("notes").select("title,body,updated_at").in("id", byType.note)
        : Promise.resolve({ data: [] as any[] }),
      byType.capture.length
        ? supabase.from("messages").select("content,created_at").in("id", byType.capture)
        : Promise.resolve({ data: [] as any[] }),
      byType.file.length
        ? supabase.from("ingested_files").select("filename,extracted_text,created_at").in("id", byType.file)
        : Promise.resolve({ data: [] as any[] }),
      byType.finding.length
        ? supabase.from("sherlock_findings").select("finding_type,summary,status,created_at").in("id", byType.finding)
        : Promise.resolve({ data: [] as any[] }),
      byType.commitment.length
        ? supabase.from("commitments").select("summary,status,due_at").in("id", byType.commitment)
        : Promise.resolve({ data: [] as any[] }),
      byType.action.length
        ? supabase.from("actions").select("title,status,risk").in("id", byType.action)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const lines: string[] = [];
    lines.push(`Project: ${project.title}`);
    if (project.summary) lines.push(`Current brief: ${project.summary}`);
    const fmt = (label: string, arr: any[], pick: (x: any) => string) => {
      if (!arr?.length) return;
      lines.push(`\n${label}:`);
      arr.slice(0, 20).forEach((x) => lines.push(`- ${pick(x)}`));
    };
    fmt("Notes", notes.data ?? [], (n) => `${n.title ? `[${n.title}] ` : ""}${(n.body ?? "").slice(0, 500)}`);
    fmt("Captures", captures.data ?? [], (c) => (c.content ?? "").slice(0, 300));
    fmt("Files", files.data ?? [], (f) => `${f.filename}${f.extracted_text ? ` — ${f.extracted_text.slice(0, 200)}` : ""}`);
    fmt("Findings", findings.data ?? [], (s) => `${s.finding_type ?? "finding"} (${s.status}): ${s.summary ?? ""}`);
    fmt("Commitments", commitments.data ?? [], (c) => `${c.summary} [${c.status}${c.due_at ? `, due ${c.due_at}` : ""}]`);
    fmt("Actions", actions.data ?? [], (a) => `${a.title} [${a.status}${a.risk ? `, ${a.risk} risk` : ""}]`);

    if (lines.length <= 1) {
      return new Response(JSON.stringify({ summary: project.summary ?? "", empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `${VANTA_CORE_VOICE}

Write a Living Brief for this project. 4-7 short paragraphs or tight bullets.
Cover: where things stand, what's moved recently, who/what is involved, what's next.
Plain English. No headings unless useful. No invented facts — only what's in the context.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: lines.join("\n") },
        ],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`ai gateway ${r.status}`);
    const j = await r.json();
    const summary = (j.choices?.[0]?.message?.content ?? "").trim();

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "project",
      entity_id: project_id,
      event: "project.summarized",
      payload: {
        item_count: items?.length ?? 0,
        chars: summary.length,
      },
    });

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
