// journey-watch — the sweep that speaks up when you land.
//
// Doctrine:
//   - It refreshes only legs that are close to a filed time. A journey next
//     month costs nothing; a journey today gets read.
//   - It reports a diff, never a status. "Nothing changed" is a valid outcome
//     and produces no nudge at all.
//   - Every heads-up ends on the terminal caveat: the board in the terminal wins.
//   - It never buys, holds, or checks anyone in, and it never overrides your word.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeAviationstack, type LiveFlight } from "../_shared/flightStatus.ts";
import type { FlightPlan } from "../_shared/flightPlan.ts";
import {
  TERMINAL_CAVEAT,
  arrivalMessage,
  journeysFrom,
  offlinePack,
  packDiff,
  whereOnJourney,
} from "../_shared/journey.ts";
import { journeyNotice, mayPingDuringQuietHours, type JourneyNotice } from "../_shared/journeyNotice.ts";
import { isInQuietHours } from "../_shared/drift.ts";
import { chatIdForUser, sendTelegram } from "../_shared/telegramApi.ts";

/**
 * Reach the person on Telegram with the same note Today just got.
 *
 * Double-gated: the awareness opt-in has to be on AND a chat has to be linked.
 * Quiet hours hold everything except a leg that is off or diverted. Returns
 * whether a message actually went out.
 */
async function reachMessaging(
  sb: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string | null,
  notice: JourneyNotice,
): Promise<boolean> {
  if (!Deno.env.get("TELEGRAM_API_KEY")) return false;

  const { data: profile } = await sb
    .from("profiles")
    .select("timezone, preferences")
    .eq("id", userId)
    .maybeSingle();
  const prefs = ((profile as { preferences?: Record<string, unknown> } | null)?.preferences ?? {}) as Record<
    string,
    unknown
  >;
  if (prefs.telegram_awareness_enabled !== true) return false;

  const tz = ((profile as { timezone?: string } | null)?.timezone as string) || "UTC";
  if (isInQuietHours(tz) && !mayPingDuringQuietHours(notice.urgency)) return false;

  const chatId = await chatIdForUser(sb, userId);
  if (!chatId) return false;

  const res = await sendTelegram({
    admin: sb,
    userId,
    chatId,
    text: `${notice.title}. ${notice.body}`,
    organizationId,
    kind: "notice",
    entityType: "nudge",
    entityId: null,
    auditEvent: "journey.reached_messaging",
    auditFailedEvent: "journey.reach_messaging_failed",
    auditPayload: { urgency: notice.urgency, title: notice.title, source: "journey_watch" },
  });
  if (!res.ok) console.error("journey-watch telegram reach failed", res.reason);
  return res.ok;
}

const KEY = Deno.env.get("AVIATIONSTACK_API_KEY") ?? Deno.env.get("FLIGHT_API_KEY") ?? "";
/** Rows are only pulled for days around now; nothing further out costs anything. */
const WINDOW_HOURS = 8;
/** A reading younger than this is reused. */
const FRESH_MS = 20 * 60_000;
/** Hard ceiling on provider readings per calendar day, across everyone. */
const DAILY_BUDGET = Number(Deno.env.get("FLIGHT_DAILY_BUDGET") ?? "40");
/** How early before a filed departure a leg becomes worth reading. */
const BEFORE_DEPART_MIN = 180;
/** How long after a filed arrival a leg stays worth reading. */
const AFTER_ARRIVE_MIN = 120;
/** With no clock times at all, a leg is only read on its own day. */
const DAY_ONLY_MS = 26 * 3_600_000;

/**
 * Is this leg close enough to a filed time to be worth a paid reading?
 * A flight next week, or one that landed yesterday, is not. When the provider
 * has already said "landed" or "cancelled", there is nothing left to ask.
 */
function worthReading(p: FlightPlan, now: number): boolean {
  const live = (p.live_status ?? null) as LiveFlight | null;
  const said = (live?.status ?? "").toLowerCase();
  if (said === "landed" && live?.arrival?.actual) {
    /* Landed and stamped — one more reading buys nothing. */
    const at = Date.parse(live.arrival.actual);
    if (Number.isFinite(at) && now - at > AFTER_ARRIVE_MIN * 60_000) return false;
  }
  if (said === "cancelled") return false;

  const pick = (...vals: (string | null | undefined)[]) => {
    for (const v of vals) {
      const t = v ? Date.parse(v) : NaN;
      if (Number.isFinite(t)) return t;
    }
    return NaN;
  };
  const dep = pick(
    live?.departure?.actual,
    live?.departure?.estimated,
    live?.departure?.scheduled,
    p.options[0]?.depart_at,
  );
  const arr = pick(
    live?.arrival?.actual,
    live?.arrival?.estimated,
    live?.arrival?.scheduled,
    p.options[0]?.arrive_at,
  );

  if (!Number.isFinite(dep) && !Number.isFinite(arr)) {
    /* Bare flight: number and a day, no clock. Read only around that day. */
    const day = Date.parse(`${p.depart_on}T00:00:00Z`);
    return Number.isFinite(day) && now >= day - 6 * 3_600_000 && now <= day + DAY_ONLY_MS;
  }
  const from = (Number.isFinite(dep) ? dep : arr) - BEFORE_DEPART_MIN * 60_000;
  const to = (Number.isFinite(arr) ? arr : dep) + AFTER_ARRIVE_MIN * 60_000;
  return now >= from && now <= to;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function asPlan(r: Record<string, unknown>): FlightPlan {
  return {
    ...(r as unknown as FlightPlan),
    options: Array.isArray(r.options) ? (r.options as FlightPlan["options"]) : [],
    event_ids: Array.isArray(r.event_ids) ? (r.event_ids as string[]) : [],
  };
}

async function askProvider(flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  const url = new URL("https://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", KEY);
  url.searchParams.set("flight_iata", flight_no);
  url.searchParams.set("flight_date", flight_date);
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) {
    console.error(`aviationstack failed [${res.status}]: ${text}`);
    return null;
  }
  const payload = JSON.parse(text || "{}");
  if (payload?.error) {
    console.error("aviationstack error body", JSON.stringify(payload.error));
    return null;
  }
  return normalizeAviationstack(payload, { flight_no, flight_date });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!KEY) return json({ error: "no_flight_provider", checked: 0 }, 503);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();
  const soon = new Date(now + WINDOW_HOURS * 3_600_000).toISOString().slice(0, 10);
  const since = new Date(now - 36 * 3_600_000).toISOString().slice(0, 10);

  try {
    /* Only live journeys: your own legs, not dropped, leaving around now. */
    const { data, error } = await sb
      .from("flight_plans")
      .select("*")
      .neq("status", "dropped")
      .in("ownership", ["mine", "mine_too"])
      .gte("depart_on", since)
      .lte("depart_on", soon)
      .limit(200);
    if (error) throw new Error(error.message);

    const plans = (data ?? []).map((r) => asPlan(r as Record<string, unknown>));
    const byUser = new Map<string, FlightPlan[]>();
    for (const p of plans) {
      const uid = (p as unknown as { user_id?: string }).user_id;
      if (!uid) continue;
      byUser.set(uid, [...(byUser.get(uid) ?? []), p]);
    }

    /* The day's ledger of paid readings — the ceiling nothing gets past. */
    const dayStart = new Date(now).toISOString().slice(0, 10);
    const { count: spentToday } = await sb
      .from("api_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("provider", "aviationstack")
      .eq("feature", "journey-watch")
      .eq("cache_hit", false)
      .gte("created_at", `${dayStart}T00:00:00Z`);
    let spent = spentToday ?? 0;

    let readings = 0;
    let heads_up = 0;
    let pinged = 0;
    let skipped_budget = 0;

    for (const [userId, own] of byUser) {
      const before = journeysFrom(own)[0] ?? null;
      const beforePack = before ? offlinePack(before, new Date(now)) : null;

      /* Refresh the legs that are actually near a filed time. */
      for (const p of own) {
        const stamp = p.live_checked_at ? new Date(p.live_checked_at).getTime() : 0;
        if (now - stamp < FRESH_MS) continue;
        if (!worthReading(p, now)) continue;
        const flightNo = (p.options[0]?.flight_no ?? "").replace(/\s+/g, "").toUpperCase();
        if (!flightNo) continue;
        if (spent >= DAILY_BUDGET) {
          /* Budget spent. The journey still reads from the last stamped reading. */
          skipped_budget += 1;
          continue;
        }
        const live = await askProvider(flightNo, p.depart_on);
        readings += 1;
        spent += 1;
        await sb.from("api_usage_logs").insert({
          owner_id: userId,
          user_id: userId,
          provider: "aviationstack",
          feature: "journey-watch",
          request_type: "flight_status",
          status: live ? "ok" : "empty",
          cache_hit: false,
          related_entity_type: "flight_plan",
          related_entity_id: p.id,
        } as never);
        if (!live) continue;
        await sb
          .from("flight_plans")
          .update({ live_status: live as never, live_checked_at: new Date().toISOString() })
          .eq("id", p.id);
        (p as FlightPlan).live_status = live;
        (p as FlightPlan).live_checked_at = new Date().toISOString();
      }

      const after = journeysFrom(own)[0] ?? null;
      if (!after) continue;
      const news = packDiff(beforePack, offlinePack(after, new Date()));
      const where = whereOnJourney(after);
      const landed = arrivalMessage(after);

      /* One heads-up, and only when something actually moved or you just landed.
         How loud it is comes off the change itself, not off a feeling. */
      const notice = journeyNotice({ news, whereWords: where.words, landed, caveat: TERMINAL_CAVEAT });
      if (!notice) continue;
      const body = notice.body;

      const orgId = (own[0] as unknown as { organization_id?: string | null }).organization_id ?? null;
      /* Don't stack the same heads-up twice. */
      const { data: pending } = await sb
        .from("nudges")
        .select("id, body")
        .eq("user_id", userId)
        .eq("kind", "journey_moved")
        .eq("status", "pending")
        .limit(5);
      if ((pending ?? []).some((n) => (n as { body?: string }).body === body)) continue;

      await sb.from("nudges").insert({
        user_id: userId,
        organization_id: orgId,
        kind: "journey_moved",
        title: notice.title,
        body,
        priority: notice.priority,
        status: "pending",
        related_entity_type: "flight_plan",
        related_entity_id: after.legs[where.legIndex]?.plan_id ?? after.legs[0]?.plan_id ?? null,
        dedupe_key: `journey_moved:${after.id}:${body.slice(0, 60)}`,
      } as never);
      heads_up += 1;

      /* Messaging is a second surface for the same note, never a second brain.
         Consent is double-gated (opt-in plus a linked chat) and quiet hours hold
         everything except a leg that is off. */
      if (notice.reachMessaging) {
        const reached = await reachMessaging(sb, userId, orgId, notice);
        if (reached) pinged += 1;
      }
    }

    return json({
      users: byUser.size,
      readings,
      heads_up,
      pinged,
      skipped_budget,
      spent_today: spent,
      daily_budget: DAILY_BUDGET,
    });
  } catch (e) {
    console.error("journey-watch failed:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown failure" }, 500);
  }
});
