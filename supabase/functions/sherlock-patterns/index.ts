// sherlock-patterns — observe-mode scanner. Looks across the user's substrate
// for soft signals (stale commitments, snoozed reminders, near-duplicate notes,
// recurring entity activity) and writes them as `observe` findings into
// `sherlock_findings`. Never executes anything; the user reviews from the Hub.
//
// Doctrine: Recognition ≠ Execution. Patterns are surfaced as drafts only.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FindingDraft = {
  source_object_type: string;
  source_object_id?: string | null;
  finding_type: string;
  summary: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  suggested_action?: string | null;
  target_object_type?: string | null;
  target_object_id?: string | null;
  extracted_data?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "no auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
    const userId = u.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const drafts: FindingDraft[] = [];

    // ---- 1) Stale commitments: open, due in the past by >2d, no recent reminder
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: stale } = await admin
      .from("commitments")
      .select("id, summary, due_at, last_reminded_at, updated_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .lt("due_at", twoDaysAgo)
      .limit(50);
    for (const c of stale ?? []) {
      const lastTouch = c.last_reminded_at ?? c.updated_at;
      if (lastTouch && new Date(lastTouch) > new Date(sevenDaysAgo)) continue;
      drafts.push({
        source_object_type: "commitment",
        source_object_id: c.id,
        finding_type: "stale_commitment",
        summary: `Still open past due: "${truncate(c.summary, 60)}"`,
        rationale: `Due ${human(c.due_at)} · no nudge since ${human(lastTouch)}.`,
        confidence: "medium",
        suggested_action: "renegotiate_or_close",
        extracted_data: { due_at: c.due_at, last_touch: lastTouch },
      });
    }

    // ---- 2) Near-duplicate notes: same lowercased title in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: notes } = await admin
      .from("notes")
      .select("id, title, body, created_at")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .limit(300);
    const seen = new Map<string, { id: string; title: string }>();
    for (const n of notes ?? []) {
      const key = (n.title?.toLowerCase().trim() || n.body?.slice(0, 60).toLowerCase().trim() || "").trim();
      if (!key || key.length < 8) continue;
      const prev = seen.get(key);
      if (prev) {
        drafts.push({
          source_object_type: "note",
          source_object_id: n.id,
          finding_type: "near_duplicate_note",
          summary: `Looks like a duplicate of "${truncate(prev.title || key, 50)}"`,
          rationale: `Two recent notes share the same opening. Worth merging or linking.`,
          confidence: "low",
          suggested_action: "merge_or_link",
          target_object_type: "note",
          target_object_id: prev.id,
        });
      } else {
        seen.set(key, { id: n.id, title: n.title ?? "" });
      }
    }

    // ---- 3) Recurring entity activity: entity with ≥4 links in last 14d
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: links } = await admin
      .from("entity_links")
      .select("entity_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", fourteenDaysAgo)
      .limit(500);
    const counts = new Map<string, number>();
    for (const l of links ?? []) counts.set(l.entity_id, (counts.get(l.entity_id) ?? 0) + 1);
    const recurring = [...counts.entries()].filter(([, n]) => n >= 4).slice(0, 10);
    if (recurring.length > 0) {
      const ids = recurring.map(([id]) => id);
      const { data: ents } = await admin
        .from("entities")
        .select("id, display_name, kind")
        .in("id", ids);
      for (const [id, n] of recurring) {
        const e = ents?.find((x) => x.id === id);
        if (!e) continue;
        drafts.push({
          source_object_type: "entity",
          source_object_id: id,
          finding_type: "recurring_entity",
          summary: `"${e.display_name}" keeps showing up — ${n} mentions in 14 days`,
          rationale: `Recurring across your captures. Might be worth a dedicated thread or commitment.`,
          confidence: "medium",
          suggested_action: "promote_to_topic",
          extracted_data: { mention_count: n, kind: e.kind },
        });
      }
    }

    // Persist drafts via createFinding (cooldown-aware)
    let written = 0;
    let suppressed = 0;
    for (const d of drafts) {
      const r = await createFinding(admin, userId, d);
      if (r) written++; else suppressed++;
    }

    await admin.from("audit_log").insert({
      user_id: userId,
      entity_type: "sherlock_patterns",
      event: "sherlock_patterns_scanned",
      payload: { drafts: drafts.length, written, suppressed },
    });

    return json({ ok: true, drafts: drafts.length, written, suppressed });
  } catch (e) {
    console.error("[sherlock-patterns]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function createFinding(admin: any, userId: string, d: FindingDraft) {
  // Cooldown enforcement (mirror of client-side lifecycle helper)
  if (d.suggested_action || d.target_object_id) {
    let q = admin
      .from("sherlock_findings")
      .select("id, cooldown_until")
      .eq("user_id", userId)
      .eq("source_object_type", d.source_object_type)
      .eq("status", "dismissed");
    if (d.source_object_id) q = q.eq("source_object_id", d.source_object_id);
    if (d.suggested_action) q = q.eq("suggested_action", d.suggested_action);
    const { data: blocked } = await q.limit(1);
    if (blocked?.[0]?.cooldown_until && new Date(blocked[0].cooldown_until) > new Date()) {
      return null;
    }
  }
  // Skip if an identical pending finding already exists
  const { data: dup } = await admin
    .from("sherlock_findings")
    .select("id")
    .eq("user_id", userId)
    .eq("source_object_type", d.source_object_type)
    .eq("finding_type", d.finding_type)
    .eq("status", "pending")
    .limit(1);
  if (dup?.[0]) return null;

  const { data, error } = await admin
    .from("sherlock_findings")
    .insert({
      user_id: userId,
      source_object_type: d.source_object_type,
      source_object_id: d.source_object_id ?? null,
      mode: "observe",
      finding_type: d.finding_type,
      summary: d.summary,
      rationale: d.rationale,
      confidence: d.confidence,
      suggested_action: d.suggested_action ?? null,
      target_object_type: d.target_object_type ?? null,
      target_object_id: d.target_object_id ?? null,
      extracted_data: d.extracted_data ?? {},
      surface_origin: "patterns",
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[sherlock-patterns] insert failed", error.message);
    return null;
  }
  await admin.from("audit_log").insert({
    user_id: userId,
    entity_type: "sherlock_finding",
    entity_id: data.id,
    event: "sherlock_finding_created",
    payload: { mode: "observe", finding_type: d.finding_type, surface_origin: "patterns" },
  });
  return data;
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
function human(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 0) return `${days}d ago`;
  return `in ${-days}d`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
