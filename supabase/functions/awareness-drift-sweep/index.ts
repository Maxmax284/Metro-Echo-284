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
import { sendWebPush } from "../_shared/webpush.ts";
import { planDelivery, pushPayload } from "../_shared/delivery/index.ts";
import { chatIdForUser, sendTelegram } from "../_shared/telegramApi.ts";
import { enqueueBridgeUpdate } from "../_shared/outboundBridge.ts";
import { readBrandVoice, styleNotice } from "../_shared/brandVoice.ts";
import { attentionButtons, keyboard, openButton } from "../_shared/telegramReplies.ts";
import {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  driftScopeTargets,
  isInQuietHours,
  type DriftProject,
  type DriftRisk,
} from "../_shared/drift.ts";
import {
  actionToSignal,
  calendarChangeSignals,
  type CalendarChangeRow,
  calendarSignals,
  type CalendarEventRow,

  captureRouteToSignal,
  sherlockFindingToSignal,
  type SherlockFindingRow,
  commitmentToSignal,
  documentRiskToSignal,
  documentToSignal,
  driftToSignal,
  evaluateAwareness,
  retireResolved,
  compressNotice,
  signalDedupeKey,
  type AttentionBudget,
  type AwarenessSignal,
  type DocumentRow,
  type EntityState,
  type PriorState,
  sensorAllowed,
  postureHolds,
} from "../_shared/awareness/index.ts";
import { appointmentReminderSignals, eventKey } from "../_shared/awareness/reminders.ts";
import { appointmentWeather, type ForecastHour } from "../_shared/awareness/appointmentWeather.ts";

/**
 * The hours of forecast for where this person is, or nothing at all.
 * Weather only ever rides on an appointment heads-up, so a failure here is
 * silence, not an error.
 */
async function forecastForUser(sb: SupabaseClient, userId: string): Promise<ForecastHour[] | null> {
  try {
    const { data } = await sb
      .from("awareness_places")
      .select("geo, updated_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    const geo = ((data ?? []) as { geo?: { lat?: number; lon?: number } | null }[])
      .map((r) => r.geo)
      .find((g) => g && typeof g.lat === "number" && typeof g.lon === "number");
    if (!geo) return null;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=3&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[]; precipitation_probability?: number[] };
    };
    const times = j.hourly?.time ?? [];
    if (!times.length) return null;
    return times.map((t, i) => ({
      at: t.endsWith("Z") ? t : `${t}:00Z`.replace(/:00:00Z$/, ":00:00Z"),
      tempC: j.hourly?.temperature_2m?.[i] ?? null,
      condition: weatherCodeLabel(j.hourly?.weather_code?.[i]),
      rainChance: j.hourly?.precipitation_probability?.[i] ?? null,
    }));
  } catch {
    return null;
  }
}

/** Only what the provider actually reported, in plain words. */
function weatherCodeLabel(code: number | undefined): string | null {
  if (typeof code !== "number") return null;
  if (code === 0) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 65) return "rain";
  if (code === 66 || code === 67) return "freezing rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return null;
}

type ScopeTarget = { organizationId: string | null };
type SweepOutcome = "none" | "shadow" | "proposed";

const DAY_MS = 24 * 60 * 60 * 1000;

function scoped(q: any, userId: string, orgId: string | null) {
  const base = q.eq("user_id", userId);
  return orgId ? base.eq("organization_id", orgId) : base.is("organization_id", null);
}
/**
 * Retire pending nudges whose underlying situation quietly got handled.
 * Reads only inside the given scope; writes a Receipt for each retirement.
 */
async function retirePendingNudges(
  sb: SupabaseClient,
  userId: string,
  orgId: string | null,
  scopeCols: Record<string, unknown>,
  nowMs: number,
): Promise<number> {
  const { data: pending } = await scoped(
    sb.from("nudges").select("id, kind, related_entity_type, related_entity_id, dedupe_key, expires_at"),
    userId,
    orgId,
  ).in("status", ["pending", "seen"]).limit(50);

  const rows = (pending ?? []) as any[];
  if (!rows.length) return 0;

  const idsFor = (type: string) =>
    rows.filter((n) => n.related_entity_type === type && n.related_entity_id).map((n) => n.related_entity_id);

  const commitmentIds = idsFor("commitment");
  const actionIds = idsFor("action");
  const projectIds = idsFor("project");
  const documentIds = idsFor("document");
  const findingIds = idsFor("sherlock_finding");
  const captureIds = rows
    .filter((n) => n.kind === "capture_unrouted" && n.related_entity_id)
    .map((n) => n.related_entity_id);

  const [c, a, p, d, cap, sf] = await Promise.all([
    commitmentIds.length
      ? scoped(sb.from("commitments").select("id, status"), userId, orgId).in("id", commitmentIds)
      : Promise.resolve({ data: [] as any[] }),
    actionIds.length
      ? scoped(sb.from("actions").select("id, status"), userId, orgId).in("id", actionIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? scoped(sb.from("projects").select("id, updated_at"), userId, orgId).in("id", projectIds)
      : Promise.resolve({ data: [] as any[] }),
    documentIds.length
      ? scoped(sb.from("documents").select("id, status"), userId, orgId).in("id", documentIds)
      : Promise.resolve({ data: [] as any[] }),
    captureIds.length
      ? scoped(sb.from("capture_routes").select("capture_id, user_action"), userId, orgId).in(
          "capture_id",
          captureIds,
        )
      : Promise.resolve({ data: [] as any[] }),
    findingIds.length
      ? scoped(sb.from("sherlock_findings").select("id, status"), userId, orgId).in("id", findingIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const state: EntityState = {
    commitments: {}, actions: {}, projects: {}, documents: {}, captures: {}, sherlockFindings: {},
  };
  for (const r of (c.data ?? []) as any[]) state.commitments[r.id] = r.status;
  for (const r of (a.data ?? []) as any[]) state.actions[r.id] = r.status;
  for (const r of (p.data ?? []) as any[]) state.projects[r.id] = r.updated_at;
  for (const r of (d.data ?? []) as any[]) state.documents![r.id] = r.status;
  for (const r of (cap.data ?? []) as any[]) {
    const prev = state.captures![r.capture_id];
    state.captures![r.capture_id] = r.user_action ?? prev ?? null;
  }

  for (const r of (sf.data ?? []) as any[]) state.sherlockFindings![r.id] = r.status;

  const retirements = retireResolved(rows, state, nowMs);
  if (!retirements.length) return 0;

  await sb
    .from("nudges")
    .update({ status: "dismissed", updated_at: new Date(nowMs).toISOString() })
    .in("id", retirements.map((r) => r.id));

  await sb.from("audit_log").insert(
    retirements.map((r) => ({
      user_id: userId,
      ...scopeCols,
      entity_type: "nudge",
      entity_id: null,
      event: "nudge.resolved",
      payload: { nudge_id: r.id, reason: r.reason, dedupe_key: r.dedupeKey, source: "resolution_recheck" },
    })),
  );
  return retirements.length;
}

/**
 * Send the single surfaced note to the user's registered devices. Never called
 * unless the ladder recommended "phone", which itself requires opt-in plus a
 * live subscription. Failures are logged, never retried loudly.
 */
async function reachPhone(
  sb: SupabaseClient,
  userId: string,
  scopeCols: Record<string, unknown>,
  decision: { title: string; nextStep: string; entityType?: string; entityId?: string; urgency: string },
): Promise<void> {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return;

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  let sent = 0;
  let failed = 0;
  /* Conclusion first, a deep link to the exact thing, and only low-consequence
     actions. Nothing here approves anything: "Later" and "Got it" carry a status
     back into the platform, where the person decides. */
  const plan = planDelivery({
    situation: {
      id: decision.entityId ?? "nudge",
      kind: `nudge.${decision.entityType ?? "nudge"}`,
      url: "/?room=today",
    },
    urgency: (decision.urgency as never) ?? "attention",
    sensitivity: "ordinary",
    headline: decision.title,
    detail: decision.nextStep,
    changeKey: decision.entityId ?? decision.title,
    context: { pushOptIn: true, pushSubscribed: true },
  });
  const payload = pushPayload(plan);

  for (const s of subs as any[]) {
    const r = await sendWebPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      { ...payload, tag: "vanta-awareness" },
      { vapidPublicKey, vapidPrivateKey, vapidSubject },
    );
    if (r.ok) {
      sent++;
      await sb.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq("id", s.id);
    } else if (r.shouldDelete) {
      await sb.from("push_subscriptions").delete().eq("id", s.id);
    } else {
      failed++;
      await sb.from("push_subscriptions")
        .update({ last_error: r.error ?? `status ${r.status}` })
        .eq("id", s.id);
    }
  }

  await sb.from("audit_log").insert({
    user_id: userId,
    ...scopeCols,
    entity_type: "nudge",
    entity_id: decision.entityId ?? null,
    event: "nudge.delivered",
    payload: { channel: "phone", urgency: decision.urgency, sent, failed, source: "scheduled_sweep" },
  });
}


async function sweepScope(
  sb: SupabaseClient,
  userId: string,
  target: ScopeTarget,
  now: Date,
  shadowMode: boolean,
  deliveryCtx: { pushOptIn: boolean; pushSubscribed: boolean },
  /** Consent + posture, resolved once per user by the caller. */
  senses: {
    calendar: boolean;
    postureHold: boolean;
    timezone?: string;
    deferToGoogle?: boolean;
    /** Recorded hours for where this person is, when a fix exists. */
    forecast?: ForecastHour[] | null;
  } = { calendar: true, postureHold: false },

): Promise<SweepOutcome> {
  const orgId = target.organizationId;
  const nowMs = now.getTime();
  const scopeCols = orgId ? { organization_id: orgId } : { organization_id: null };

  const [
    { data: projectRows },
    { data: openCommitments },
    { data: riskyActions },
    { data: documentRows },
    { data: captureRows },
    { data: sherlockRows },
  ] = await Promise.all([
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
    scoped(
      sb.from("documents").select("id, title, status, updated_at, project_id"),
      userId,
      orgId,
    ).limit(100),
    scoped(
      sb.from("capture_routes").select(
        "id, capture_kind, capture_id, source, suggested_route, user_action, created_at",
      ),
      userId,
      orgId,
    ).is("user_action", null).limit(100),
    scoped(
      sb.from("sherlock_findings").select(
        "id, finding_type, summary, rationale, confidence, status, sensitive_flag, suggested_action, source_object_type, source_object_id, created_at",
      ),
      userId,
      orgId,
    ).eq("status", "pending").limit(100),
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

  // ---- resolution recheck ---------------------------------------------------
  // A pending note whose situation got handled dies now, not at cooldown.
  await retirePendingNudges(sb, userId, orgId, scopeCols, nowMs);

  // ---- normalize every candidate, then let the evaluator decide -------------
  const scope = { userId, organizationId: orgId };
  const signals: AwarenessSignal[] = [];

  for (const d of [
    detectUnreadRisk(risks, nowMs),
    detectDriftingCommitment(commitments, nowMs),
    detectSilentProject(projects, nowMs),
  ]) {
    if (d) signals.push(driftToSignal(d, scope, nowMs));
  }
  for (const c of commitments) {
    const s = commitmentToSignal(c, scope, nowMs);
    if (s) signals.push(s);
  }
  for (const a of riskyActions ?? []) {
    const s = actionToSignal(a as any, scope, nowMs);
    if (s) signals.push(s);
  }

  // Documents: stalled drafts/reviews, then serious risks nobody answered.
  const documents = (documentRows ?? []) as DocumentRow[];
  for (const doc of documents) {
    const s = documentToSignal(doc, scope, nowMs);
    if (s) signals.push(s);
  }
  if (documents.length) {
    const byId = new Map(documents.map((d) => [d.id, d]));
    const { data: riskRows } = await sb
      .from("document_risks")
      .select("id, document_id, severity, title, created_at")
      .eq("user_id", userId)
      .in("document_id", documents.map((d) => d.id))
      .limit(100);
    for (const r of (riskRows ?? []) as any[]) {
      const s = documentRiskToSignal(r, byId.get(r.document_id), scope, nowMs);
      if (s) signals.push(s);
    }
  }

  // Captures that never got a decision.
  for (const c of (captureRows ?? []) as any[]) {
    const s = captureRouteToSignal(c, scope, nowMs);
    if (s) signals.push(s);
  }

  // Sherlock recognitions nobody answered.
  for (const f of (sherlockRows ?? []) as SherlockFindingRow[]) {
    const s = sherlockFindingToSignal(f, scope, nowMs);
    if (s) signals.push(s);
  }

  // A flight Echo read in mail or a forwarded message, still waiting on one
  // answer: is it yours? The recognition already wrote the question — this is
  // where it earns the right to be said anywhere other than the flight desk.
  // The dedupe key is the recognition's own, so nothing is asked twice.
  const noticeContext: Record<string, { hoursUntilDue: number | null }> = {};
  const { data: noticedFlights } = await scoped(
    sb.from("flight_plans").select("id, origin, destination, depart_on, ownership, origin_kind, options, noticed_from, created_at"),
    userId,
    orgId,
  )
    .eq("origin_kind", "recognised")
    .eq("ownership", "unknown")
    .gte("depart_on", new Date(nowMs - DAY_MS).toISOString().slice(0, 10))
    .limit(30);
  const noticedRows: NoticedFlightRow[] = ((noticedFlights ?? []) as any[]).map((p) => {
    const option = Array.isArray(p.options) ? (p.options[0] ?? {}) : {};
    return {
      id: p.id,
      flight_no: (option.flight_no as string | null) ?? null,
      airline: (option.airline as string | null) ?? null,
      origin: p.origin ?? null,
      destination: p.destination ?? null,
      depart_on: p.depart_on ?? null,
      ownership: p.ownership ?? null,
      origin_kind: p.origin_kind ?? null,
      source_words: (p.noticed_from?.source_words as string | null) ?? null,
      created_at: p.created_at,
    };
  });
  for (const s of flightNoticeSignals(noticedRows, scope, nowMs)) {
    signals.push(s);
    const row = noticedRows.find((r) => r.id === s.entityId);
    noticeContext[s.id] = { hoursUntilDue: row ? hoursUntilDeparture(row, nowMs) : null };
  }


  // The calendar sense: what starts soon, and which promise lands mid-meeting.
  // Read-only, scope-filtered, and it only ever supplies facts.
  const { data: calendarRows } = senses.calendar ? await scoped(
    sb.from("calendar_events").select("id, uid, title, location, starts_at, ends_at, all_day, feed_id, project_id"),
    userId,
    orgId,
  )
    .gte("starts_at", new Date(nowMs - 60 * 60 * 1000).toISOString())
    .lte("starts_at", new Date(nowMs + 3 * DAY_MS).toISOString())
    .limit(200) : { data: [] as CalendarEventRow[] };
  for (const s of calendarSignals(
    (calendarRows ?? []) as CalendarEventRow[],
    commitments.map((c) => ({ id: c.id, summary: c.summary, due_at: c.due_at, status: c.status })),
    scope,
    nowMs,
  )) {
    signals.push(s);
  }

  // Changes to the shape of the day: a meeting moved, or came off entirely.
  // calendar-sync records these; the sweep is where they earn the right to
  // speak, and each one is only ever mentioned once.
  const { data: changeRows } = senses.calendar ? await scoped(
    sb.from("calendar_changes").select("id, title, change, old_starts_at, new_starts_at, was_filed, detected_at"),
    userId,
    orgId,
  )
    .is("signaled_at", null)
    .gte("detected_at", new Date(nowMs - DAY_MS).toISOString())
    .order("detected_at", { ascending: false })
    .limit(40) : { data: [] as CalendarChangeRow[] };
  const changes = (changeRows ?? []) as CalendarChangeRow[];
  for (const s of calendarChangeSignals(changes, scope, nowMs)) signals.push(s);
  if (changes.length) {
    await sb
      .from("calendar_changes")
      .update({ signaled_at: new Date(nowMs).toISOString() })
      .in("id", changes.map((c) => c.id));
  }

  // A calm heads-up for an appointment that is genuinely coming: the evening
  // before, and once on the day. One per appointment, whichever feed carries
  // it, and never for something already speaking because it moved.
  if (senses.calendar) {
    const events = (calendarRows ?? []) as (CalendarEventRow & { uid?: string | null })[];
    // Only a fresh change speaks for itself. Old feed churn must never silence
    // an appointment for good.
    const FRESH_CHANGE_MS = 3 * 60 * 60 * 1000;
    const changedTitles = new Set(
      changes
        .filter((c) => nowMs - new Date(c.detected_at).getTime() <= FRESH_CHANGE_MS)
        .map((c) => (c.title ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    const changedUids = events
      .filter((e) => changedTitles.has((e.title ?? "").trim().toLowerCase()))
      .map((e) => eventKey(e));

    // Anything the person explicitly asked Echo to keep an eye on outranks the
    // quiet default. Watches carry the feed's own uid as their subject.
    const { data: watchRows } = await scoped(
      sb.from("watches").select("subject_id, kind, state, success_when"),
      userId,
      orgId,
    )
      .eq("kind", "calendar_event")
      .in("state", ["on_it", "watching", "waiting"])
      .limit(100);
    const explicitUids = ((watchRows ?? []) as any[])
      /* A subscribed feed's uid is not a database key, so identity lives in
         success_when.uid; subject_id only when Echo owns the row. */
      .map((w) => String(w?.success_when?.uid ?? "").trim() || ((w.subject_id ?? "") as string))
      .filter(Boolean);

    for (const s of appointmentReminderSignals(events, scope, nowMs, senses.timezone || "UTC", {
      explicitUids,
      changedUids,
      // Google already alarms on the day. When the person leaves that to
      // Google, Echo only keeps the part Google never says: tomorrow's shape.
      deferToGoogle: senses.deferToGoogle === true,
      // The sky around the appointment, folded into the same sentence.
      weatherFor: (e) =>
        appointmentWeather(e.starts_at, senses.forecast ?? null, senses.timezone || "UTC", nowMs),
      // The person's own filing rides along, by recorded name only.
      projectFor: (e) => {
        const pid = (e as { project_id?: string | null }).project_id ?? null;
        if (!pid) return null;
        const hit = (projectRows ?? []).find((p: any) => p.id === pid);
        return (hit?.title as string | undefined)?.trim() || null;
      },
    })) {
      signals.push(s);
    }
  }





  if (signals.length === 0) return "none";

  // Prior state for these exact situations, plus what Echo already said
  // recently in this scope. Suppression needs memory, not guesses.
  const keys = signals.map((s) => signalDedupeKey(s));
  const [{ data: priorRows }, { data: recentRows }] = await Promise.all([
    scoped(
      sb.from("nudges").select("dedupe_key, status, priority, created_at, updated_at"),
      userId,
      orgId,
    ).in("dedupe_key", keys),
    scoped(
      sb.from("nudges").select("status, created_at"),
      userId,
      orgId,
    ).gte("created_at", new Date(nowMs - 7 * DAY_MS).toISOString()).limit(200),
  ]);

  const priors: Record<string, PriorState> = {};
  for (const r of priorRows ?? []) {
    priors[(r as any).dedupe_key] = {
      dedupeKey: (r as any).dedupe_key,
      status: (r as any).status,
      lastSurfacedAt: (r as any).created_at,
      lastUrgency: null,
    };
  }

  const recent = (recentRows ?? []) as any[];
  const budget: AttentionBudget = {
    surfacedLast24h: recent.filter((r) => nowMs - new Date(r.created_at).getTime() < DAY_MS).length,
    dismissedLast7d: recent.filter((r) => r.status === "dismissed").length,
    inQuietHours: false, // handled by the caller before we get here
  };

  const result = evaluateAwareness({
    signals,
    context: noticeContext,
    priors,
    budget,
    deliveryContext: deliveryCtx,
    now: nowMs,
  });


  // Shadow mode: the full evaluation is recorded either way. This is developer
  // telemetry, not a user Receipt.
  await sb.from("audit_log").insert({
    user_id: userId,
    ...scopeCols,
    entity_type: "awareness",
    entity_id: null,
    event: "awareness.evaluated",
    payload: {
      source: "scheduled_sweep",
      shadow_mode: shadowMode,
      candidates: result.records.length,
      queued: result.queued,
      would_surface: result.surface
        ? {
            dedupe_key: result.surface.dedupeKey,
            urgency: result.surface.urgency,
            channel: result.surface.delivery.recommendedChannel,
            bundled: result.surface.bundledCount,
          }
        : null,
      records: result.records,
    },
  });

  if (!result.surface) return "none";
  if (shadowMode) return "shadow";

  // A posture the user set by hand holds ordinary notes. Critical still speaks.
  if (senses.postureHold && result.surface.urgency !== "critical") {
    await sb.from("audit_log").insert({
      user_id: userId,
      ...scopeCols,
      entity_type: "awareness",
      entity_id: null,
      event: "awareness.held",
      payload: {
        source: "scheduled_sweep",
        reason: "posture",
        dedupe_key: result.surface.dedupeKey,
        urgency: result.surface.urgency,
      },
    });
    return "none";
  }

  const decision = result.surface;
  const { error } = await sb.from("nudges").upsert(
    [{
      user_id: userId,
      ...scopeCols,
      kind: decision.bundle.lead.signal.type,
      title: decision.title,
      body: `${decision.why} ${decision.nextStep}`,
      related_entity_type: decision.entityType ?? null,
      related_entity_id: decision.entityId ?? null,
      priority: decision.priority,
      // Situation identity, not day identity. signalDedupeKey() is already
      // scope-segmented, and it is the same key the priors lookup above reads —
      // day-keying it here made suppression memory permanently blind.
      dedupe_key: decision.dedupeKey,
      status: "pending",
      expires_at: new Date(nowMs + 3 * DAY_MS).toISOString(),
    }],
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
  if (error) {
    console.warn("drift-sweep nudge upsert", error.message);
    return "none";
  }
  const { data: storedNudge } = await sb.from("nudges")
    .select("id").eq("user_id", userId).eq("dedupe_key", decision.dedupeKey).maybeSingle();
  const nudgeId = String((storedNudge as { id?: string } | null)?.id ?? decision.entityId ?? decision.dedupeKey);

  await sb.from("audit_log").insert({
    user_id: userId,
    ...scopeCols,
    entity_type: "nudge",
    entity_id: decision.entityId ?? null,
    event: "nudge.proposed",
    payload: {
      kind: decision.bundle.lead.signal.type,
      urgency: decision.urgency,
      why: decision.why,
      next_step: decision.nextStep,
      bundled: decision.bundledCount,
      source: "scheduled_sweep",
    },
  });


  // Forward the same awareness update to the hub. Durable queue + signed body,
  // retried by bridge-dispatch. Notification only: the hub never approves or
  // executes anything, it just learns what Echo noticed.
  await enqueueBridgeUpdate(sb, {
    ownerId: userId,
    organizationId: (scopeCols as { organization_id?: string | null }).organization_id ?? null,
    eventType: `awareness.nudge.${decision.bundle.lead.signal.type}`,
    title: decision.title,
    lines: [decision.why, decision.nextStep].filter(Boolean) as string[],
    urgency: decision.urgency === "critical" ? "critical" : decision.urgency === "high" ? "high" : "normal",
    payload: {
      kind: decision.bundle.lead.signal.type,
      priority: decision.priority,
      related_entity_type: decision.entityType ?? null,
      related_entity_id: decision.entityId ?? null,
      bundled: decision.bundledCount,
    },
    idempotencyKey: `nudge:${userId}:${decision.dedupeKey}`,
  });

  // The nudge always lands in Today. Reaching the phone is a second, narrower
  // step: only when the ladder asked for it, push is opted into, and a device
  // is registered. Quiet hours were already honoured by the caller.
  //
  // One event, one delivery: the ledger claim below is what stops the same
  // change buzzing on the phone and arriving on Telegram as if they were two
  // separate pieces of news.
  const surface = decision.delivery.recommendedChannel;
  if (surface === "phone" || surface === "messaging") {
    const claimed = await claimDelivery(sb, userId, scopeCols, {
      situationKind: `nudge.${decision.bundle.lead.signal.type}`,
      situationId: decision.entityId ?? decision.dedupeKey,
      dedupeKey: `nudge:${decision.dedupeKey}`,
      surface,
      urgency: decision.urgency,
      headline: decision.title,
      because: `awareness ladder chose ${surface}`,
    });
    if (claimed) {
      if (surface === "phone") await reachPhone(sb, userId, scopeCols, decision);
      else await reachMessaging(sb, userId, scopeCols, decision, nudgeId);
    }
  }
  return "proposed";


}

/**
 * Claim the right to deliver this exact change on this exact surface. The unique
 * index on (user, dedupe key, surface) is the referee: a second claim for the
 * same news loses and nothing is sent twice.
 */
async function claimDelivery(
  sb: SupabaseClient,
  userId: string,
  scopeCols: Record<string, unknown>,
  d: {
    situationKind: string;
    situationId: string;
    dedupeKey: string;
    surface: string;
    urgency: string;
    headline: string;
    because: string;
  },
): Promise<boolean> {
  const { error } = await sb.from("deliveries").insert({
    user_id: userId,
    ...scopeCols,
    situation_kind: d.situationKind,
    situation_id: d.situationId,
    dedupe_key: d.dedupeKey,
    surface: d.surface,
    urgency: d.urgency,
    sensitivity: "ordinary",
    because: d.because,
    headline: d.headline,
    status: "sent",
  });
  if (!error) return true;
  /* A duplicate key means this news already went out. Silence is correct. */
  return false;
}


/**
 * Reach the user where they actually are: their linked Telegram chat.
 *
 * Messaging is a notification surface only. The line says what changed and
 * where to look — it never carries an approve/execute control, because nothing
 * executes from messaging. Consent is double-gated by the caller (pref on AND
 * a linked chat), and quiet hours were already honoured before we got here.
 */
async function reachMessaging(
  sb: SupabaseClient,
  userId: string,
  scopeCols: Record<string, unknown>,
  decision: { title: string; nextStep: string; why: string; entityType?: string; entityId?: string; urgency: string },
  nudgeId: string,
): Promise<void> {
  if (!Deno.env.get("TELEGRAM_API_KEY")) return;

  /* One reader for "which chat is this person on" — telegram_chat_links records
     linked_at, not created_at, and ordering by a column that does not exist made
     this whole reach fail silently. */
  const chatId = await chatIdForUser(sb, userId);
  if (!chatId) return;


  const { data: voiceProfile } = await sb
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const text = styleNotice(
    compressNotice(
      {
        title: decision.title,
        why: decision.why,
        nextStepLine: `${decision.nextStep} Open Metro Echo to act on it.`,
      },
      "brief",
    ),
    readBrandVoice((voiceProfile as { preferences?: Record<string, unknown> } | null)?.preferences ?? {}),
  );

  /* One outbound path: sends, records the message on the thread, writes the receipt. */
  const res = await sendTelegram({
    admin: sb,
    userId,
    chatId,
    text,
    replyMarkup: keyboard(attentionButtons(nudgeId), [openButton("today")]),
    organizationId: (scopeCols as { organization_id?: string | null }).organization_id ?? null,
    kind: "notice",
    entityType: decision.entityType ?? "nudge",
    entityId: decision.entityId ?? null,
    auditEvent: "nudge.reached_messaging",
    auditFailedEvent: "nudge.reach_messaging_failed",
    auditPayload: {
      urgency: decision.urgency,
      title: decision.title,
      source: "scheduled_sweep",
    },
  });
  if (!res.ok) console.error("drift sweep telegram reach failed", res.reason);
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
    /* The cron sweeps everyone. A person asking from inside the app can only
       ever sweep themselves, whatever the body says. */
    const caller = await (async (): Promise<string | null> => {
      const authz = req.headers.get("Authorization") ?? "";
      const token = authz.replace(/^Bearer\s+/i, "");
      if (!token || token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return null;
      const { data } = await sb.auth.getUser(token);
      return data?.user?.id ?? null;
    })();
    const onlyUser: string | null = caller ?? body?.user_id ?? null;


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
    let shadowed = 0;
    let quiet = 0;
    let swept = 0;

    for (const p of optedIn) {
      const prefs = (p.preferences ?? {}) as Record<string, any>;
      const tz = (p.timezone as string) || "UTC";
      // Shadow mode records the full evaluation without ever speaking.
      const shadowMode = prefs.awareness_shadow_mode === true || body?.shadow === true;
      if (isInQuietHours(tz, prefs.quiet_hours_start ?? "22:00", prefs.quiet_hours_end ?? "07:00", now)) {
        quiet++;
        continue;
      }

      // Push is only a candidate channel when the user asked for it AND owns a
      // registered device. Checked once per user, not per scope.
      let pushSubscribed = false;
      if (prefs.push_reminders_enabled === true) {
        const { count } = await sb
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id);
        pushSubscribed = (count ?? 0) > 0;
      }

      // Same shape for messaging: opted in AND a linked Telegram chat exists.
      let messagingLinked = false;
      if (prefs.telegram_awareness_enabled === true) {
        const { count } = await sb
          .from("telegram_chat_links")
          .select("chat_id", { count: "exact", head: true })
          .eq("user_id", p.id);
        messagingLinked = (count ?? 0) > 0;
      }


      let calendarFeedCount = 0;
      if (prefs.sensor_consent?.calendar !== false) {
        const { count } = await sb
          .from("calendar_feeds")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id);
        calendarFeedCount = count ?? 0;
      }

      const { data: memberships } = await sb
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", p.id)
        .eq("status", "active");

      /* One forecast read per person, only when the calendar sense is live —
         weather has no voice of its own here. */
      const forecast = calendarFeedCount > 0 || sensorAllowed(prefs, "calendar")
        ? await forecastForUser(sb, p.id)
        : null;

      const targets = driftScopeTargets(
        ((memberships ?? []) as any[]).map((m) => m.organization_id as string),
      );

      for (const t of targets) {
        swept++;
        const outcome = await sweepScope(sb, p.id, t, now, shadowMode, {
          pushOptIn: prefs.push_reminders_enabled === true,
          pushSubscribed: pushSubscribed,
          messagingOptIn: prefs.telegram_awareness_enabled === true,
          messagingLinked: messagingLinked,
        }, {
          // Adding a feed IS consent for the calendar sense; the toggle can
          // withdraw it without deleting the feed.
          calendar: sensorAllowed(prefs, "calendar") || calendarFeedCount > 0,
          timezone: tz,
          // Default is to stay out of Google's lane: Google covers the same-day
          // alarm, Echo covers tomorrow, moves and collisions.
          deferToGoogle: prefs.calendar_defer_to_google !== false,
          forecast,
          postureHold: postureHolds(prefs, "attention", now.getTime()),
        });
        if (outcome === "proposed") proposed++;
        if (outcome === "shadow") shadowed++;
      }
    }

    return json({
      ok: true,
      users_opted_in: optedIn.length,
      users_quiet: quiet,
      scopes_swept: swept,
      proposed,
      shadowed,
    });
  } catch (e) {
    console.error("awareness-drift-sweep error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
