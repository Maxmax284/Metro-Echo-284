// compose-brief — Command Center brief composer.
// User-tap only. Pulls a small rolled-up snapshot scoped to the requester
// (entity or whole-system), then one Lovable AI pass produces a structured
// brief. Emits brief.generated to audit_log. No persistence here — saving and
// exporting is the client's job (so user can review before export).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

type Format =
  | "operator" | "client" | "audit_packet" | "weekly_review" | "audio_script";

type Input = {
  format: Format;
  scope_kind: "system" | "entity";
  entity_id?: string | null;
  range_days?: number;
};

type Section = {
  id: string;
  heading?: string;
  kind: "prose" | "list" | "timeline" | "decision" | "receipts" | "pull_quote";
  body: any;
};

type Brief = {
  title: string;
  subtitle: string | null;
  sections: Section[];
  appendix_receipts: { kind: string; id: string; label?: string }[];
  grounding: Record<string, unknown>;
  signals_hash: string;
  format: Format;
  scope_kind: "system" | "entity";
  entity_id: string | null;
  generated_at: string;
};

async function sha(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

const FORMAT_TONE: Record<Format, string> = {
  operator: "Direct, tactical, in second person. No fluff. Plain English.",
  client: "Clean and professional. Suitable for an external client. Remove any internal reasoning, debug language, or speculation.",
  audit_packet: "Receipts-first. Lead with what happened and when. Minimal prose. Cite timestamps.",
  weekly_review: "Reflective, scoped to the last seven days. Group by project or entity. Calm tone.",
  audio_script: "Spoken-style. Conversational but composed. No headings, no bullet characters. One flowing block.",
};

const FORMAT_SECTIONS: Record<Format, string[]> = {
  operator: ["overview", "recent_changes", "needs_attention", "open_commitments", "active_actions", "sherlock", "next_moves"],
  client: ["overview", "recent_changes", "decisions", "next_moves"],
  audit_packet: ["overview", "timeline", "decisions", "receipts"],
  weekly_review: ["overview", "what_changed", "decisions", "open_commitments", "next_moves"],
  audio_script: ["spoken"],
};

async function buildEntitySnapshot(supabase: any, uid: string, entity_id: string) {
  const { data: rollup, error } = await supabase.rpc("entity_rollup", { _entity_id: entity_id });
  if (error) throw error;
  return rollup;
}

async function buildSystemSnapshot(supabase: any, uid: string, range_days: number) {
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

function fallbackBrief(format: Format, snapshot: any, scope_label: string): Section[] {
  const counts = snapshot?.counts ?? {};
  const overview = scope_label
    ? `${scope_label} snapshot. ${counts.cross_links ?? 0} cross-links · ${counts.audit_7d ?? 0} audit events in the last week.`
    : "System snapshot.";
  return [
    { id: "overview", heading: "Overview", kind: "prose", body: overview },
    { id: "receipts", heading: "Recent receipts", kind: "receipts",
      body: (snapshot?.recent_audit ?? snapshot?.audit ?? []).slice(0, 6) },
  ];
}

async function aiCompose(format: Format, scope_label: string, snapshot: any): Promise<{
  title: string; subtitle: string | null; sections: Section[];
} | null> {
  if (!LOVABLE_KEY) return null;
  const sectionList = FORMAT_SECTIONS[format];
  const tone = FORMAT_TONE[format];
  const system = `You are Vanta's brief composer.

Tone: ${tone}

Doctrine:
- Never invent facts. Only describe what is present in the snapshot.
- Plain English on top. No emojis. No exclamation marks. Not corporate slop.
- Each fact you state should be grounded in an item from the snapshot.

Return STRICT JSON in this exact shape:
{
  "title": "string (max 80 chars)",
  "subtitle": "string or null",
  "sections": [
    { "id": "string from the requested section list", "heading": "string or null",
      "kind": "prose|list|timeline|decision|receipts|pull_quote",
      "body": "string OR array OR object depending on kind" }
  ]
}

Requested sections for this format (use these IDs; skip any with no data): ${sectionList.join(", ")}.
For "audio_script" format, return a single section with id="spoken", kind="prose", no heading, one flowing paragraph.
For "receipts" sections, body is an array of strings like "2026-06-05 14:22 — commitment.completed (Deposit payment)".
For "list" sections, body is an array of short strings.
For "timeline" sections, body is an array of {when, what} objects.
For "decision" sections, body is {decision, why}.`;

  const userMsg = `Scope: ${scope_label}\nFormat: ${format}\nSnapshot:\n${JSON.stringify(snapshot).slice(0, 12000)}`;

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
      snapshot = await buildEntitySnapshot(supabase, uid, input.entity_id);
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
    const appendix_receipts = auditSource.slice(0, 12).map((a) => ({
      kind: a.entity_type, id: a.entity_id, label: `${a.event} · ${a.created_at}`,
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

    // Audit: brief.generated
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
