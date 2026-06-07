// compose-brief — Command Center brief composer.
// Doctrine:
// - User-tap only. No background execution.
// - Every CLAIM in a brief carries `receipts` pointing to source items / audit events.
// - System scope pulls a consolidated view across pinned projects + recent activity.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

type Format =
  | "operator" | "client" | "audit_packet" | "weekly_review" | "audio_script";

type Audience =
  | "me" | "internal_operator" | "client" | "audit" | "implementation" | "presentation";

type Input = {
  format: Format;
  scope_kind: "system" | "entity" | "project";
  entity_id?: string | null;
  project_id?: string | null;
  audience?: Audience;
  range_days?: number;
};

type Grounding = { kind: string; id: string; label?: string };

type Section = {
  id: string;
  heading?: string;
  kind: "prose" | "list" | "timeline" | "decision" | "receipts" | "pull_quote";
  body: any;
  receipts?: Grounding[];
};

type Brief = {
  title: string;
  subtitle: string | null;
  sections: Section[];
  appendix_receipts: Grounding[];
  grounding: Record<string, unknown>;
  signals_hash: string;
  format: Format;
  scope_kind: "system" | "entity" | "project";
  entity_id: string | null;
  project_id: string | null;
  audience: Audience | null;
  generated_at: string;
};

async function sha(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

const FORMAT_TONE: Record<Format, string> = {
  operator: "Direct, tactical, in second person. No fluff. Plain English.",
  client: "Clean and professional. Suitable for an external client. Remove any internal reasoning, debug language, or speculation.",
  audit_packet: "Receipts-first. Lead with what happened and when. Minimal prose. Cite timestamps.",
  weekly_review: "Reflective, scoped to the last seven days. Group by project or entity. Calm tone. Suitable as a client-facing weekly summary.",
  audio_script: "Spoken-style. Conversational but composed. No headings, no bullet characters. One flowing block.",
};

const AUDIENCE_TONE: Record<string, string> = {
  me: "Audience: the user themselves. Direct, terse, operational, no fluff.",
  internal_operator: "Audience: an internal operator who will act on this. Clean operational summary, easy to act on. Plain English.",
  client: "Audience: an external client. Polished and professional. Strip internal reasoning, debug language, and private signals.",
  audit: "Audience: an auditor. Receipts-first. Lead with timestamps and proof. Minimal interpretation.",
  implementation: "Audience: a builder. Emphasize requirements, decisions, risks, and concrete next steps.",
  presentation: "Audience: a single-page presentation. Tight, scannable, executive voice. Skip filler.",
};

const FORMAT_SECTIONS: Record<Format, string[]> = {
  operator: ["overview", "recent_changes", "needs_attention", "open_commitments", "active_actions", "sherlock", "next_moves"],
  client: ["overview", "recent_changes", "decisions", "next_moves"],
  audit_packet: ["overview", "timeline", "decisions", "receipts"],
  weekly_review: ["overview", "what_changed", "decisions", "open_commitments", "next_moves"],
  audio_script: ["spoken"],
};

async function buildEntitySnapshot(supabase: any, entity_id: string) {
  const { data: rollup, error } = await supabase.rpc("entity_rollup", { _entity_id: entity_id });
  if (error) throw error;
  return rollup;
}

async function buildSystemSnapshot(supabase: any, uid: string, range_days: number) {
  // Prefer the system_rollup RPC, fall back to raw queries if unavailable.
  try {
    const { data, error } = await supabase.rpc("system_rollup", { _range_days: range_days });
    if (!error && data) return data;
  } catch (_e) { /* fall through */ }

  const since = new Date(Date.now() - range_days * 86400_000).toISOString();
  const [pinned, commits, actions, sherlock, audit, captures] = await Promise.all([
    supabase.from("entities").select("id, display_name, kind, slug, summary, pinned, parent_entity_id")
      .eq("user_id", uid).or("kind.eq.project,pinned.eq.true").limit(20),
    supabase.from("commitments").select("id, summary, status, priority, due_at, updated_at")
      .eq("user_id", uid).neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("actions").select("id, title, risk, status, updated_at")
      .eq("user_id", uid).in("status", ["staged", "proposed", "executed"])
      .order("updated_at", { ascending: false }).limit(15),
    supabase.from("sherlock_findings").select("id, source_object_type, summary, suggested_action, confidence, mode, updated_at")
      .eq("user_id", uid).eq("status", "pending").order("updated_at", { ascending: false }).limit(10),
    supabase.from("audit_log").select("id, event, entity_type, entity_id, created_at")
      .eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    supabase.from("messages").select("id, role, content, created_at")
      .eq("user_id", uid).eq("role", "user").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    pinned_entities: pinned.data ?? [],
    commitments: commits.data ?? [],
    actions: actions.data ?? [],
    sherlock: sherlock.data ?? [],
    audit: audit.data ?? [],
    recent_captures: captures.data ?? [],
    range_days,
  };
}

async function buildProjectSnapshot(supabase: any, project_id: string) {
  const [{ data: project }, { data: items }, { data: recentAudit }, { data: lastExports }] = await Promise.all([
    supabase.from("projects").select("id,title,summary,status,brief_structured,updated_at").eq("id", project_id).maybeSingle(),
    supabase.from("project_items").select("item_type,item_id").eq("project_id", project_id),
    supabase.from("audit_log").select("id,event,created_at,payload").eq("entity_type","project").eq("entity_id",project_id).order("created_at",{ascending:false}).limit(25),
    supabase.from("brief_exports").select("id,title,created_at,storage_path").eq("project_id",project_id).order("created_at",{ascending:false}).limit(3),
  ]);
  const byType: Record<string,string[]> = { capture:[], note:[], file:[], finding:[], commitment:[], action:[] };
  for (const it of items ?? []) byType[(it as any).item_type]?.push((it as any).item_id);
  const [notes, captures, files, findings, commitments, actions] = await Promise.all([
    byType.note.length ? supabase.from("notes").select("id,title,body,updated_at").in("id", byType.note) : Promise.resolve({ data: [] }),
    byType.capture.length ? supabase.from("messages").select("id,content,created_at").in("id", byType.capture) : Promise.resolve({ data: [] }),
    byType.file.length ? supabase.from("ingested_files").select("id,filename,created_at").in("id", byType.file) : Promise.resolve({ data: [] }),
    byType.finding.length ? supabase.from("sherlock_findings").select("id,finding_type,summary,status").in("id", byType.finding) : Promise.resolve({ data: [] }),
    byType.commitment.length ? supabase.from("commitments").select("id,summary,status,due_at").in("id", byType.commitment) : Promise.resolve({ data: [] }),
    byType.action.length ? supabase.from("actions").select("id,title,status,risk").in("id", byType.action) : Promise.resolve({ data: [] }),
  ]);
  return {
    project, structured: project?.brief_structured ?? null,
    notes: notes.data ?? [], captures: captures.data ?? [], files: files.data ?? [],
    findings: findings.data ?? [], commitments: commitments.data ?? [], actions: actions.data ?? [],
    recent_audit: recentAudit ?? [], prior_exports: lastExports ?? [],
  };
}

function fallbackBrief(_format: Format, snapshot: any, scope_label: string): Section[] {
  const counts = snapshot?.counts ?? {};
  const overview = scope_label
    ? `${scope_label} snapshot. ${counts.cross_links ?? counts.audit_7d ?? 0} cross-links · ${counts.audit_7d ?? 0} audit events in the last week.`
    : "System snapshot.";
  const recent = (snapshot?.recent_audit ?? snapshot?.audit ?? []).slice(0, 6);
  return [
    {
      id: "overview", heading: "Overview", kind: "prose",
      body: overview,
      receipts: recent.map((a: any) => ({ kind: "audit", id: a.id, label: a.event })),
    },
    {
      id: "receipts", heading: "Recent receipts", kind: "receipts",
      body: recent.map((a: any) => `${a.created_at?.slice(0, 19).replace("T", " ")} — ${a.event}`),
      receipts: recent.map((a: any) => ({ kind: "audit", id: a.id, label: a.event })),
    },
  ];
}

async function aiCompose(format: Format, scope_label: string, snapshot: any, audience: Audience | null): Promise<{
  title: string; subtitle: string | null; sections: Section[];
} | null> {
  if (!LOVABLE_KEY) return null;
  const sectionList = FORMAT_SECTIONS[format];
  const tone = FORMAT_TONE[format];
  const audienceTone = audience ? AUDIENCE_TONE[audience] : "";
  const system = `You are Vanta's brief composer.

Tone: ${tone}
${audienceTone ? `\n${audienceTone}\n` : ""}
Doctrine:
- Never invent facts. Only describe what is present in the snapshot.
- Plain English on top. No emojis. No exclamation marks.
- Never name internal tooling ("Sherlock", "findings", "captures", "the database", "filed").
- EVERY claim you make must be grounded in source ids from the snapshot.
- For "list" and "timeline" items, return objects: { "text"/"what": "...", "receipts": [{ "kind": "audit"|"note"|"commitment"|"action"|"file"|"message"|"entity", "id": "<id from snapshot>" }] }.
- For "prose" sections, return { "text": "...", "receipts": [...] }.
- For "decision" sections, return { "decision": "...", "why": "...", "receipts": [...] }.

Return STRICT JSON in this exact shape:
{
  "title": "string (max 80 chars)",
  "subtitle": "string or null",
  "sections": [
    { "id": "string from the requested section list",
      "heading": "string or null",
      "kind": "prose|list|timeline|decision|receipts|pull_quote",
      "body": <see rules above>,
      "receipts": [{ "kind": "...", "id": "..." }] }
  ]
}

Requested sections for this format (use these IDs; skip any with no data): ${sectionList.join(", ")}.
For "audio_script" format, return one section: id="spoken", kind="prose", no heading, body is { "text": "<one flowing paragraph>", "receipts": [...] }.
For "receipts" sections, body is an array of strings like "2026-06-05 14:22 — commitment.completed (Deposit payment)".`;

  const userMsg = `Scope: ${scope_label}\nFormat: ${format}\nSnapshot (use IDs from this for receipts):\n${JSON.stringify(snapshot).slice(0, 14000)}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.warn("compose-brief AI failed", resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed?.sections || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch (e) {
    console.warn("compose-brief AI error", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = (await req.json()) as Input;
    if (!input?.format || !input?.scope_kind) {
      return new Response(JSON.stringify({ error: "format and scope_kind required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let snapshot: any;
    let scopeLabel = "Whole system";
    let entityId: string | null = null;
    if (input.scope_kind === "entity") {
      if (!input.entity_id) {
        return new Response(JSON.stringify({ error: "entity_id required for entity scope" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      snapshot = await buildEntitySnapshot(supabase, input.entity_id);
      scopeLabel = snapshot?.entity?.display_name ?? "Entity";
      entityId = input.entity_id;
    } else {
      snapshot = await buildSystemSnapshot(supabase, uid, input.range_days ?? 7);
    }

    const ai = await aiCompose(input.format, scopeLabel, snapshot);
    const sections: Section[] = ai?.sections ?? fallbackBrief(input.format, snapshot, scopeLabel);
    const title = ai?.title ?? `${scopeLabel} — ${input.format.replace("_", " ")}`;
    const subtitle = ai?.subtitle ?? null;

    // Receipts appendix: pull from audit
    const auditSource = (snapshot?.recent_audit ?? snapshot?.audit ?? []) as any[];
    const appendix_receipts: Grounding[] = auditSource.slice(0, 12).map((a) => ({
      kind: "audit", id: a.id, label: `${a.event} · ${a.created_at}`,
    }));

    const signals_hash = await sha(JSON.stringify({ snapshot, format: input.format }));
    const brief: Brief = {
      title,
      subtitle,
      sections,
      appendix_receipts,
      grounding: {
        scope: input.scope_kind,
        entity_id: entityId,
        snapshot_keys: Object.keys(snapshot ?? {}),
      },
      signals_hash,
      format: input.format,
      scope_kind: input.scope_kind,
      entity_id: entityId,
      generated_at: new Date().toISOString(),
    };

    await supabase.from("audit_log").insert({
      user_id: uid,
      entity_type: "brief",
      event: "brief.generated",
      payload: {
        format: input.format,
        scope_kind: input.scope_kind,
        entity_id: entityId,
        signals_hash,
        ai_used: !!ai,
      },
    });

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compose-brief error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "compose failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
