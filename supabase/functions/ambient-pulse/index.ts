import { corsHeaders } from "../_shared/http.ts";
// ambient-pulse: generates proactive nudges on app open.
// - Overdue commitments
// - Commitments due today
// - Approved actions awaiting execution
// - Stale captures with no follow-up
// - Briefing-on-arrival when location moves significantly from last known place
// - Drift detection (opt-in): one quiet signal at a time, quiet-hours aware
//
// Doctrine: nudges are drafts. Nothing here stages, approves or executes.
// Every read and write is filtered to the caller's active room.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { applyServerScope, resolveScopeContext, serverScopeFields } from "../_shared/authContext.ts";
import {
  calendarSignals,
  signalDedupeKey,
  type CalendarEventRow,
  postureHolds,
} from "../_shared/awareness/index.ts";
import {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  isInQuietHours,
  mayRepropose,
  rankDrift,
  scopedDedupeKey,
  situationDedupeKey,
  type DriftProject,
  type DriftRisk,
} from "../_shared/drift.ts";

type NudgeIn = {
  kind: string;
  title: string;
  body?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  priority?: number;
  dedupe_key?: string;
  expires_at?: string;
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );

    const body = await req.json().catch(() => ({}));
    const ctx = await resolveScopeContext(req, supabase as any, body?.organization_id ?? null);
    if (!ctx) return json({ error: "unauthorized" }, 401);
    const user = { id: ctx.userId };
    const scope = ctx.scope;
    const scopeCols = serverScopeFields(scope);
    const orgId = scope.type === "organization" ? scope.organizationId : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "ambient-pulse", _limit: 12, _window_seconds: 60 });
    if (allowed === false) return json({ proposed: 0, created: 0, rate_limited: true });

    const here: { lat: number; lon: number } | null =
      body?.geo && typeof body.geo.lat === "number" && typeof body.geo.lon === "number"
        ? { lat: body.geo.lat, lon: body.geo.lon }
        : null;

    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const dayKey = now.toISOString().slice(0, 10);
    const nudges: NudgeIn[] = [];
    // Day-keyed: questions that are genuinely worth re-asking each day and
    // always carry an expiry (arrival, weekly synthesis).
    const scopedKey = (base: string) => scopedDedupeKey(base, orgId, dayKey);
    // Situation-keyed: one nudge per situation, for as long as the situation
    // lasts. Re-proposal is gated below by pending state and a dismissal cooldown.
    const situationKey = (base: string) => situationDedupeKey(base, orgId);

    // 1. Overdue commitments
    const { data: overdue } = await applyServerScope(
      supabase.from("commitments").select("id, summary, due_at") as any,
      scope,
    )
      .eq("status", "open")
      .lt("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(5);

    for (const c of overdue ?? []) {
      nudges.push({
        kind: "commitment_overdue",
        title: "Overdue commitment",
        body: c.summary,
        related_entity_type: "commitment",
        related_entity_id: c.id,
        priority: 90,
        dedupe_key: situationKey(`overdue:${c.id}`),
      });
    }

    // 2. Commitments due today
    const { data: dueToday } = await applyServerScope(
      supabase.from("commitments").select("id, summary, due_at") as any,
      scope,
    )
      .eq("status", "open")
      .gte("due_at", now.toISOString())
      .lte("due_at", todayEnd.toISOString())
      .limit(5);

    for (const c of dueToday ?? []) {
      nudges.push({
        kind: "commitment_due_today",
        title: "Due today",
        body: c.summary,
        related_entity_type: "commitment",
        related_entity_id: c.id,
        priority: 75,
        dedupe_key: situationKey(`due_today:${c.id}`),
      });
    }

    // 3. Approved actions awaiting execution
    const { data: ready } = await applyServerScope(
      supabase.from("actions").select("id, title") as any,
      scope,
    )
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5);

    for (const a of ready ?? []) {
      nudges.push({
        kind: "action_ready",
        title: "Ready to execute",
        body: a.title,
        related_entity_type: "action",
        related_entity_id: a.id,
        priority: 70,
        dedupe_key: situationKey(`action_ready:${a.id}`),
      });
    }

    // 4. Stale captures (notes from >3 days ago with no autolinks/commitments referencing them)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleNotes } = await applyServerScope(
      supabase.from("notes").select("id, title, body, created_at") as any,
      scope,
    )
      .lt("created_at", threeDaysAgo)
      .order("created_at", { ascending: false })
      .limit(2);

    for (const n of staleNotes ?? []) {
      nudges.push({
        kind: "note_stale",
        title: "Revisit a capture",
        body: n.title || (n.body ?? "").slice(0, 120),
        related_entity_type: "note",
        related_entity_id: n.id,
        priority: 30,
        dedupe_key: situationKey(`note_stale:${n.id}`),
      });
    }

    // 5. Briefing-on-arrival
    if (here) {
      const { data: places } = await supabase
        .from("awareness_places")
        .select("id, label, geo, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);

      let nearest: { id: string; label: string; km: number } | null = null;
      for (const p of places ?? []) {
        const g = p.geo as { lat?: number; lon?: number } | null;
        if (!g || typeof g.lat !== "number" || typeof g.lon !== "number") continue;
        const km = haversineKm(here, { lat: g.lat, lon: g.lon });
        if (!nearest || km < nearest.km) nearest = { id: p.id, label: p.label, km };
      }

      const FAR_KM = 5;
      if (!nearest || nearest.km > FAR_KM) {
        nudges.push({
          kind: "arrival_new_area",
          title: "You appear to be somewhere new",
          body: nearest
            ? `Closest known place is ${nearest.label} (~${nearest.km.toFixed(1)} km away). Capture this spot for a briefing.`
            : "Capture this location to get an awareness briefing.",
          priority: 60,
          dedupe_key: scopedKey(`arrival:${here.lat.toFixed(2)},${here.lon.toFixed(2)}`),
          expires_at: todayEnd.toISOString(),
        });
      } else if (nearest.km <= FAR_KM) {
        // Returning to a known place — surface latest briefing if it exists
        const { data: latest } = await supabase
          .from("awareness_briefings")
          .select("id, section, generated_at")
          .eq("place_id", nearest.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest) {
          nudges.push({
            kind: "arrival_known",
            title: `Back at ${nearest.label}`,
            body: `Latest briefing section: ${latest.section}.`,
            related_entity_type: "place",
            related_entity_id: nearest.id,
            priority: 40,
            dedupe_key: situationKey(`arrival_known:${nearest.id}`),
            expires_at: todayEnd.toISOString(),
          });
        }
      }
    }

    // 6. Proactive synthesis — detect repeated tag themes over last 7 days that
    // have NOT already been investigated. One suggestion per day, lowest priority
    // so it never shouts.
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotes } = await applyServerScope(
      supabase.from("notes").select("id, tags, created_at") as any,
      scope,
    )
      .gte("created_at", sevenDaysAgo)
      .limit(200);

    const tagCount = new Map<string, number>();
    for (const n of recentNotes ?? []) {
      for (const t of (n.tags ?? []) as string[]) {
        if (!t || t.startsWith("via:") || ["imported", "upload", "email", "telegram"].includes(t)) continue;
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
    }
    const themes = [...tagCount.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1);

    for (const [tag, count] of themes) {
      // Skip if an investigation already touches this tag this week
      const { data: recentInv } = await supabase
        .from("investigations")
        .select("id, question")
        .gte("created_at", sevenDaysAgo)
        .ilike("question", `%${tag}%`)
        .limit(1);
      if (recentInv && recentInv.length) continue;
      nudges.push({
        kind: "synthesis_suggestion",
        title: `Pattern: "${tag}" came up ${count}×`,
        body: `Recurring theme in this week's captures. Run Sherlock to synthesize?`,
        priority: 35,
        dedupe_key: scopedKey(`synthesis:${tag}`),
        expires_at: todayEnd.toISOString(),
      });
    }

    // 7. Drift detection — opt-in, quiet-hours aware, one signal at a time.
    let driftState: "off" | "quiet_hours" | "posture" | "none" | "proposed" = "off";
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone, preferences")
      .eq("id", user.id)
      .maybeSingle();
    const prefs = (profile?.preferences ?? {}) as Record<string, any>;
    const driftEnabled = prefs.proactive_awareness_enabled === true;

    if (driftEnabled) {
      const tz = (profile?.timezone as string) || "UTC";
      if (isInQuietHours(tz, prefs.quiet_hours_start ?? "22:00", prefs.quiet_hours_end ?? "07:00", now)) {
        driftState = "quiet_hours";
      } else if (postureHolds(prefs, "attention", now.getTime())) {
        // The user told Vanta what kind of moment this is. Ordinary drift waits.
        driftState = "posture";
      } else {
        const nowMs = now.getTime();

        const [{ data: projectRows }, { data: openCommitments }, { data: riskyActions }] = await Promise.all([
          applyServerScope(
            supabase.from("projects").select("id, title, status, updated_at") as any,
            scope,
          ).limit(50),
          applyServerScope(
            supabase.from("commitments").select("id, summary, due_at, status, updated_at, metadata") as any,
            scope,
          ).eq("status", "open").limit(100),
          applyServerScope(
            supabase.from("actions").select("id, title, risk, status, created_at, risk_acknowledged_at") as any,
            scope,
          ).in("status", ["proposed", "staged"]).eq("risk", "high").limit(20),
        ]);

        // Open item counts per project, so silence only counts with work left.
        const projectIds = (projectRows ?? []).map((p: any) => p.id);
        const openByProject = new Map<string, number>();
        if (projectIds.length) {
          const { data: items } = await supabase
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

        // The calendar sense, on open: something imminent beats every slow
        // drift signal, so it is checked first. Facts only — no writes back to
        // the calendar, ever.
        const { data: calendarRows } = await applyServerScope(
          supabase
            .from("calendar_events")
            .select("id, title, location, starts_at, ends_at, all_day, feed_id") as any,
          scope,
        )
          .gte("starts_at", new Date(nowMs).toISOString())
          .lte("starts_at", new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString())
          .limit(200);

        const calSignals = calendarSignals(
          (calendarRows ?? []) as CalendarEventRow[],
          commitments.map((c) => ({ id: c.id, summary: c.summary, due_at: c.due_at, status: c.status })),
          { userId: user.id, organizationId: orgId },
          nowMs,
        );

        if (calSignals.length) {
          const lead = calSignals[0];
          driftState = "proposed";
          nudges.push({
            kind: lead.type,
            title: lead.summary,
            body: `${lead.why} ${lead.nextStep}`,
            related_entity_type: lead.entityType,
            related_entity_id: lead.entityId,
            priority: 80,
            dedupe_key: situationKey(signalDedupeKey(lead)),
            expires_at: new Date(nowMs + 12 * 60 * 60 * 1000).toISOString(),
          });
        }

        const signal = calSignals.length
          ? null
          : rankDrift([
              detectUnreadRisk(risks, nowMs),
              detectDriftingCommitment(commitments, nowMs),
              detectSilentProject(projects, nowMs),
            ]);


        if (signal) {
          driftState = "proposed";
          nudges.push({
            kind: signal.kind,
            title: signal.title,
            body: `${signal.reason} ${signal.next_step}`,
            related_entity_type: signal.related_entity_type,
            related_entity_id: signal.related_entity_id,
            priority: signal.priority,
            dedupe_key: situationKey(signal.dedupe_key),
            expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          });
          await supabase.from("audit_log").insert({
            user_id: user.id,
            ...scopeCols,
            entity_type: "nudge",
            entity_id: signal.related_entity_id,
            event: "nudge.proposed",
            payload: { kind: signal.kind, reason: signal.reason, next_step: signal.next_step },
          });
        } else {
          driftState = "none";
        }
      }
    }

    // Insert (dedupe_key unique partial index will silently skip duplicates)
    let created = 0;
    if (nudges.length) {
      const rows = nudges.map((n) => ({ ...n, user_id: user.id, ...scopeCols }));
      const { data: inserted, error } = await supabase
        .from("nudges")
        .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) console.warn("nudges upsert", error);
      created = inserted?.length ?? 0;
    }

    // Auto-expire stale dismissed/expired
    await supabase
      .from("nudges")
      .delete()
      .eq("user_id", user.id)
      .lt("expires_at", now.toISOString());

    return json({ proposed: nudges.length, created, drift: driftState });
  } catch (e) {
    console.error("ambient-pulse error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
