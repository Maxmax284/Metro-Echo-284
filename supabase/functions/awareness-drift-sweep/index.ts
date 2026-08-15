import { corsHeaders } from "../_shared/http.ts";
// awareness-drift-sweep — scheduled drift detection.
//
// The only cross-user path in the system, and deliberately narrow:
//   - Runs on a cron with the service role.
//   - Only touches users who explicitly turned proactive awareness ON.
//   - Reads with the same scope filters the client uses (personal + each active
//     workspace membership), so nothing leaks between rooms.
//   - Writes at most ONE draft nudge per user per scope per run.
//   - Respects quiet hours: inside the window nothing is written at all.
//
// Doctrine: detectors observe. This function drafts. Nothing here stages,
// approves or executes anything.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  driftScopeTargets,
  isInQuietHours,
  rankDrift,
  scopedDedupeKey,
  type DriftProject,
  type DriftRisk,
} from "../_shared/drift.ts";

type ScopeTarget = { organizationId: string | null };

function scoped(q: any, userId: string, orgId: string | null) {
  const base = q.eq("user_id", userId);
  return orgId ? base.eq("organization_id", orgId) : base.is("organization_id", null);
}

async function sweepScope(
  sb: SupabaseClient,
  userId: string,
  target: ScopeTarget,
  now: Date,
): Promise<"none" | "proposed"> {
  const orgId = target.organizationId;
  const nowMs = now.getTime();
  const scopeCols = orgId ? { organization_id: orgId } : { organization_id: null };

  const [{ data: projectRows }, { data: openCommitments }, { data: riskyActions }] = await Promise.all([
    scoped(sb.from("projects").select("id, title, status, updated_at"), userId, orgId).limit(50),
    scoped(
      sb.from("commitments").select("id, summary, due_at, status, updated_at, metadata"),
      userId,
      orgId,
    ).eq("status", "open").limit(100),
    scoped(
      sb.from("actions").select("id, title, risk, status, created_at, risk_acknowledged_at"),
      userId,
      orgId,
    ).in("status", ["proposed", "staged"]).eq("risk", "high").limit(20),
  ]);

  const projectIds = (projectRows ?? []).map((p: any) => p.id);
  const openByProject = new Map<string, number>();
  if (projectIds.length) {
    const { data: items } = await sb
      .from("project_items")
      .select("project_id, item_type, item_id")
      .in("project_id", projectIds)
      .limit(500);
    const openCommitmentIds = new Set((openCommitments ?? []).map((c: any) => c.id));
    const openActionIds = new Set((riskyActions ?? []).map((a: any) => a.id));
    for (const it of items ?? []) {
      const isOpen =
        (it.item_type === "commitment" && openCommitmentIds.has(it.item_id)) ||
        (it.item_type === "action" && openActionIds.has(it.item_id));
      if (isOpen) openByProject.set(it.project_id, (openByProject.get(it.project_id) ?? 0) + 1);
    }
  }

  const projects: DriftProject[] = (projectRows ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    updated_at: p.updated_at,
    open_items: openByProject.get(p.id) ?? 0,
  }));

  const commitments = (openCommitments ?? []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    due_at: c.due_at,
    status: c.status,
    reschedules: Number((c.metadata ?? {}).reschedule_count ?? 0),
    last_activity_at: c.updated_at,
  }));

  const risks: DriftRisk[] = (riskyActions ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    source: "action" as const,
    created_at: a.created_at,
    seen: Boolean(a.risk_acknowledged_at),
  }));

  const signal = rankDrift([
    detectUnreadRisk(risks, nowMs),
    detectDriftingCommitment(commitments, nowMs),
    detectSilentProject(projects, nowMs),
  ]);
  if (!signal) return "none";

  const dayKey = now.toISOString().slice(0, 10);
  const { error } = await sb.from("nudges").upsert(
    [{
      user_id: userId,
      ...scopeCols,
      kind: signal.kind,
      title: signal.title,
      body: `${signal.reason} ${signal.next_step}`,
      related_entity_type: signal.related_entity_type,
      related_entity_id: signal.related_entity_id,
      priority: signal.priority,
      dedupe_key: scopedDedupeKey(signal.dedupe_key, orgId, dayKey),
      status: "pending",
      expires_at: new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }],
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
  if (error) {
    console.warn("drift-sweep nudge upsert", error.message);
    return "none";
  }

  await sb.from("audit_log").insert({
    user_id: userId,
    ...scopeCols,
    entity_type: "nudge",
    entity_id: signal.related_entity_id,
    event: "nudge.proposed",
    payload: {
      kind: signal.kind,
      reason: signal.reason,
      next_step: signal.next_step,
      source: "scheduled_sweep",
    },
  });
  return "proposed";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as any));
    const onlyUser: string | null = body?.user_id ?? null;

    // Opt-in only. No preference, no sweep.
    let profileQuery = sb.from("profiles").select("id, timezone, preferences").limit(2000);
    if (onlyUser) profileQuery = profileQuery.eq("id", onlyUser);
    const { data: profiles, error: pErr } = await profileQuery;
    if (pErr) throw pErr;

    const optedIn = (profiles ?? []).filter(
      (p: any) => (p.preferences ?? {}).proactive_awareness_enabled === true,
    );

    const now = new Date();
    let proposed = 0;
    let quiet = 0;
    let swept = 0;

    for (const p of optedIn) {
      const prefs = (p.preferences ?? {}) as Record<string, any>;
      const tz = (p.timezone as string) || "UTC";
      if (isInQuietHours(tz, prefs.quiet_hours_start ?? "22:00", prefs.quiet_hours_end ?? "07:00", now)) {
        quiet++;
        continue;
      }

      const { data: memberships } = await sb
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", p.id)
        .eq("status", "active");

      const targets = driftScopeTargets(
        ((memberships ?? []) as any[]).map((m) => m.organization_id as string),
      );

      for (const t of targets) {
        swept++;
        const outcome = await sweepScope(sb, p.id, t, now);
        if (outcome === "proposed") proposed++;
      }
    }

    return json({
      ok: true,
      users_opted_in: optedIn.length,
      users_quiet: quiet,
      scopes_swept: swept,
      proposed,
    });
  } catch (e) {
    console.error("awareness-drift-sweep error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
