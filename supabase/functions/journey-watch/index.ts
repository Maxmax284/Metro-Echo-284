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
import { anchorLive, type LiveFlight } from "../_shared/flightStatus.ts";
import { askFlightWithFeed, aeroKey } from "../_shared/flightAsk.ts";
import type { FlightPlan } from "../_shared/flightPlan.ts";
import {
  TERMINAL_CAVEAT,
  arrivalMessage,
  journeysFrom,
  offlinePack,
  packDiff,
  whereOnJourney,
} from "../_shared/journey.ts";
import { journeyNotice } from "../_shared/journeyNotice.ts";
import { reachOnce } from "../_shared/delivery/reach.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";
import { minutesToDeparture, preDepartureNotice, preDeparturePack } from "../_shared/preDeparture.ts";
import { landedAlert } from "../_shared/landedAlert.ts";

/**
 * Before you leave — the countdown errands said once, on the same rail as every
 * other heads-up. Same module the flight card reads, so the times cannot drift
 * apart. It reminds; it checks nobody in and it holds nothing.
 */
async function beforeYouLeave(sb: any, userId: string, p: FlightPlan): Promise<boolean> {
  const live = anchorLive((p.live_status ?? null) as LiveFlight | null);
  const opt = p.options[0] ?? null;
  const departAt = live?.departure?.estimated ?? live?.departure?.scheduled ?? opt?.depart_at ?? null;
  if (!departAt) return false;
  const from = (p.origin ?? "").trim().toUpperCase() || null;
  const to = (p.destination ?? "").trim().toUpperCase() || null;
  const pack = preDeparturePack({ departAt, fromIata: from, toIata: to });
  const notice = preDepartureNotice({
    pack,
    minsToDeparture: minutesToDeparture(departAt, from),
    flightWords: live?.flight_no ?? opt?.flight_no ?? null,
    fromIata: from,
  });
  if (!notice) return false;

  /* Once per leg, ever. The dedupe key is the referee, not a timer. */
  const dedupe = `before_you_leave:${p.id}`;
  const { data: seen } = await sb.from("nudges").select("id").eq("user_id", userId).eq("dedupe_key", dedupe).limit(1);
  if ((seen ?? []).length) return false;

  const orgId = (p as unknown as { organization_id?: string | null }).organization_id ?? null;
  const { data: row } = await sb.from("nudges").insert({
    user_id: userId,
    organization_id: orgId,
    kind: "flight_before_you_leave",
    title: notice.title,
    body: notice.body,
    priority: 55,
    status: "pending",
    related_entity_type: "flight_plan",
    related_entity_id: p.id,
    dedupe_key: dedupe,
  } as never).select("id").maybeSingle();
  const nudgeId = (row as { id?: string } | null)?.id ?? null;
  if (!nudgeId) return false;

  /* Receipt: the countdown note is a recorded event, not just a nudge. */
  await writeAuditEvent(sb as never, {
    actor: userId,
    organizationId: orgId,
    entityType: "flight_plan",
    entityId: p.id,
    event: "journey.before_you_leave",
    source: "journey_watch",
    metadata: { title: notice.title, nudge_id: nudgeId },
  });

  const gate = await reachGate(sb, userId);
  if (!gate.allowed) return false;
  const surface = await reachOnce(sb, {
    userId,
    organizationId: orgId,
    nudgeId,
    title: notice.title,
    detail: notice.body,
    url: "/flights",
    changeKey: dedupe,
    urgency: "time_sensitive",
    entityType: "flight_plan",
    entityId: p.id,
    source: "journey_watch",
    situationKind: "nudge.flight_before_you_leave",
    dedupeKey: `nudge:${dedupe}`,
    because: "a filed flight is close enough that the cutoffs matter",
    openKind: "today",
    messagingAllowed: gate.messagingAllowed,
  });
  return !!surface;
}

/**
 * Consent for a second surface, read once per user.
 *
 * The awareness opt-in has to be on for Telegram. Quiet hours are NOT decided
 * here anymore: the shared rail's floor gate holds everything but the urgent
 * inside the person's own window, and leaves the receipt. One gate, one window,
 * no hardcoded night.
 */
async function reachGate(
  sb: any,
  userId: string,
): Promise<{ allowed: boolean; messagingAllowed: boolean }> {
  const { data: profile } = await sb
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const prefs = ((profile as { preferences?: Record<string, unknown> } | null)?.preferences ?? {}) as Record<
    string,
    unknown
  >;
  return { allowed: true, messagingAllowed: prefs.telegram_awareness_enabled === true };
}

const KEY = Deno.env.get("AVIATIONSTACK_API_KEY") ?? Deno.env.get("FLIGHT_API_KEY") ?? "";
/* Either feed alone is enough to watch a journey. */
const ANY_FEED = !!KEY || !!aeroKey();
/** Rows are only pulled for days around now; nothing further out costs anything. */
const WINDOW_HOURS = 8;
/** A reading younger than this is reused. */
const FRESH_MS = 20 * 60_000;
/** Around touchdown the truth changes by the minute, so the cadence tightens. */
const LANDING_FRESH_MS = 5 * 60_000;
/** Hard ceiling on provider readings per calendar day, across everyone. */
const DAILY_BUDGET = Number(Deno.env.get("FLIGHT_DAILY_BUDGET") ?? "80");
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
  const live = anchorLive((p.live_status ?? null) as LiveFlight | null);
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

/**
 * How fresh a reading must be. Fifteen minutes out from a filed arrival until
 * three quarters of an hour past it, the answer can change every sweep — that
 * window reads tighter. Everywhere else the regular cadence is plenty.
 */
function freshMs(p: FlightPlan, now: number): number {
  const live = anchorLive((p.live_status ?? null) as LiveFlight | null);
  if (!live || live.arrival?.actual) return FRESH_MS;
  const arr = live?.arrival?.estimated ?? live?.arrival?.scheduled ?? null;
  const to = (p.destination ?? "").trim().toUpperCase() || live?.arrival?.iata || null;
  if (!arr || !to) return FRESH_MS;
  const eta = minutesToDeparture(arr, to, new Date(now));
  return eta != null && eta <= 15 && eta >= -45 ? LANDING_FRESH_MS : FRESH_MS;
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

/**
 * The same question the Flights screen asks, asked the same way — including the
 * fallback for a plan that refuses a date filter. A failure is logged and read as
 * nothing on record; it never becomes a guess.
 */
async function askProvider(
  flight_no: string,
  flight_date: string,
  allow: { aero: boolean; stack: boolean },
): Promise<{ live: LiveFlight | null; feed: "aeroapi" | "aviationstack" }> {
  try {
    return await askFlightWithFeed(KEY, flight_no, flight_date, allow);
  } catch (e) {
    console.error("flight feed failed", e instanceof Error ? e.message : String(e));
    return { live: null, feed: allow.aero ? "aeroapi" : "aviationstack" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!ANY_FEED) return json({ error: "no_flight_provider", checked: 0 }, 503);

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
      /* Your own legs, plus a leg Echo noticed and cannot place yet: that one
         gets a single reading so the question you are answering carries the
         airline's route and times, never a guess. It never produces a heads-up. */
      .in("ownership", ["mine", "mine_too", "unknown"])
      .gte("depart_on", since)
      .lte("depart_on", soon)
      .limit(200);
    if (error) throw new Error(error.message);

    const plans = (data ?? []).map((r) => asPlan(r as Record<string, unknown>));
    const byUser = new Map<string, FlightPlan[]>();
    /* Noticed legs nobody has claimed yet: read once, never spoken about. */
    const unclaimedByUser = new Map<string, FlightPlan[]>();
    for (const p of plans) {
      const uid = (p as unknown as { user_id?: string }).user_id;
      if (!uid) continue;
      const ownership = (p as unknown as { ownership?: string }).ownership ?? "mine";
      if (ownership === "unknown") {
        if (p.live_checked_at) continue;
        unclaimedByUser.set(uid, [...(unclaimedByUser.get(uid) ?? []), p]);
        continue;
      }
      byUser.set(uid, [...(byUser.get(uid) ?? []), p]);
    }

    /* The day's ledger of paid readings, kept per feed. Each feed bills
       separately, so one that has burnt its day cannot silence the other. */
    const dayStart = new Date(now).toISOString().slice(0, 10);
    const spentOn = async (feed: string): Promise<number> => {
      const { count } = await sb
        .from("api_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("provider", feed)
        .eq("feature", "journey-watch")
        .eq("cache_hit", false)
        .gte("created_at", `${dayStart}T00:00:00Z`);
      return count ?? 0;
    };
    const spent: Record<string, number> = {
      aeroapi: await spentOn("aeroapi"),
      aviationstack: await spentOn("aviationstack"),
    };
    const allow = () => ({
      aero: !!aeroKey() && spent.aeroapi < DAILY_BUDGET,
      stack: !!KEY && spent.aviationstack < DAILY_BUDGET,
    });

    let readings = 0;
    let heads_up = 0;
    let pinged = 0;
    let skipped_budget = 0;

    /* One paid reading against one leg, stamped and logged. The ceiling and the
       travel window are checked here so no caller can spend around them. */
    const readLeg = async (userId: string, p: FlightPlan, force = false) => {
      const stamp = p.live_checked_at ? new Date(p.live_checked_at).getTime() : 0;
      if (!force && now - stamp < freshMs(p, now)) return;
      if (!worthReading(p, now)) return;
      /* A feed files a flight under the number of the airline that flies it, so
         the operating number is asked before the ticketed codeshare number. */
      const option: any = p.options[0] ?? null;
      const operating = String(option?.identity?.operating?.flight_no ?? "").replace(/\s+/g, "").toUpperCase();
      const flightNo = operating || (option?.flight_no ?? "").replace(/\s+/g, "").toUpperCase();
      if (!flightNo) return;
      const room = allow();
      if (!room.aero && !room.stack) {
        /* Budget spent. The journey still reads from the last stamped reading. */
        skipped_budget += 1;
        return;
      }
      const { live, feed } = await askProvider(flightNo, p.depart_on, room);
      readings += 1;
      spent[feed] = (spent[feed] ?? 0) + 1;
      await sb.from("api_usage_logs").insert({
        owner_id: userId,
        user_id: userId,
        provider: feed,
        feature: "journey-watch",
        request_type: "flight_status",
        status: live ? "success" : "failed",
        cache_hit: false,
        related_entity_type: "flight_plan",
        related_entity_id: p.id,
      } as never);
      if (!live) return;
      await sb
        .from("flight_plans")
        .update({ live_status: live as never, live_checked_at: new Date().toISOString() })
        .eq("id", p.id);
      (p as FlightPlan).live_status = live;
      (p as FlightPlan).live_checked_at = new Date().toISOString();
    };

    /* A noticed leg nobody has claimed: one reading, so the ownership question
       carries the airline's own route and times. No heads-up comes of it. */
    for (const [userId, waiting] of unclaimedByUser) {
      for (const p of waiting) await readLeg(userId, p, true);
    }

    for (const [userId, own] of byUser) {
      const before = journeysFrom(own)[0] ?? null;
      const beforePack = before ? offlinePack(before, new Date(now)) : null;

      /* Refresh the legs that are actually near a filed time. */
      for (const p of own) await readLeg(userId, p);

      /* The journey heads-up: a diff, never a status. Wrapped so its early
         exits never skip the touchdown note below. */
      await (async () => {
        const after = journeysFrom(own)[0] ?? null;
        if (!after) return;
        const news = packDiff(beforePack, offlinePack(after, new Date()));
        const where = whereOnJourney(after);
        const landed = arrivalMessage(after);

        /* The errands come before any diff: they are useful even when nothing moved. */
        const legForPack = own.find((p) => p.id === (after.legs[where.legIndex]?.plan_id ?? "")) ?? null;
        if (legForPack && (await beforeYouLeave(sb, userId, legForPack))) pinged += 1;

        /* One heads-up, and only when something actually moved or you just landed.
           How loud it is comes off the change itself, not off a feeling. */
        const notice = journeyNotice({ news, whereWords: where.words, landed, caveat: TERMINAL_CAVEAT });
        if (!notice) return;
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
        if ((pending ?? []).some((n) => (n as { body?: string }).body === body)) return;

        const planId = after.legs[where.legIndex]?.plan_id ?? after.legs[0]?.plan_id ?? null;
        /* Same heads-up with a fresher countdown is an edit, not a new notice. */
        const { data: sameTitle } = await sb.from("nudges").select("id")
          .eq("user_id", userId).eq("kind", "journey_moved").eq("status", "pending")
          .eq("title", notice.title).eq("related_entity_id", planId).limit(1);
        if (sameTitle && sameTitle.length) {
          const editId = (sameTitle[0] as { id: string }).id;
          await sb.from("nudges").update({ body } as never).eq("id", editId);
          /* A fresher countdown is an edit — the edit leaves a receipt too. */
          await writeAuditEvent(sb as never, {
            actor: userId,
            organizationId: orgId,
            entityType: "flight_plan",
            entityId: planId,
            event: "journey.notice_updated",
            source: "journey_watch",
            metadata: { title: notice.title, nudge_id: editId },
          });
          return;
        }
        const dedupe = `journey_moved:${after.id}:${body.slice(0, 60)}`;
        const { data: nudgeRow } = await sb.from("nudges").insert({
          user_id: userId,
          organization_id: orgId,
          kind: "journey_moved",
          title: notice.title,
          body,
          priority: notice.priority,
          status: "pending",
          related_entity_type: "flight_plan",
          related_entity_id: planId,
          dedupe_key: dedupe,
        } as never).select("id").maybeSingle();
        heads_up += 1;

        /* A second surface for the same note, never a second brain. Phone first
           when a device is registered, Telegram when it is not; one claim stops
           both firing for one gate change. The buttons only acknowledge, and they
           settle the same nudge Today reads, so the signal clears from the chat. */
        const nudgeId = (nudgeRow as { id?: string } | null)?.id ?? null;
        /* Receipt: the move itself is a recorded event — Receipts can show the
           disruption even after the nudge is settled. */
        await writeAuditEvent(sb as never, {
          actor: userId,
          organizationId: orgId,
          entityType: "flight_plan",
          entityId: planId,
          event: "journey.moved",
          source: "journey_watch",
          metadata: { title: notice.title, body, nudge_id: nudgeId },
        });
        if (notice.reachMessaging && nudgeId) {
          const gate = await reachGate(sb, userId);
          if (gate.allowed) {
            const surface = await reachOnce(sb, {
              userId,
              organizationId: orgId,
              nudgeId,
              title: notice.title,
              detail: body,
              url: "/?surface=schedule&tab=flights",
              changeKey: dedupe,
              urgency: notice.urgency === "critical" ? "critical" : "time_sensitive",
              entityType: "flight_plan",
              entityId: planId,
              source: "journey_watch",
              situationKind: "nudge.journey_moved",
              dedupeKey: `nudge:${dedupe}`,
              because: "a filed leg moved and the person asked to be reachable",
              openKind: "today",
              messagingAllowed: gate.messagingAllowed,
            });
            if (surface) pinged += 1;
          }
        }
      })();

      /* Wheels down, said once per touchdown. The final airport gets the same
         voice as every layover: time off the airline's record, gate and
         terminal as filed. A layover the journey heads-up already spoke for
         stays with that one note. */
      const journeyNow = journeysFrom(own)[0] ?? null;
      const whereNow = journeyNow ? whereOnJourney(journeyNow, new Date(now)) : null;
      const layoverPlanId =
        whereNow?.kind === "on_ground" && whereNow.layover && whereNow.nextLeg
          ? journeyNow?.legs[whereNow.legIndex]?.plan_id ?? null
          : null;

      for (const p of own) {
        if (p.status !== "confirmed") continue;
        const live = anchorLive((p.live_status ?? null) as LiveFlight | null);
        const opt: any = p.options[0] ?? null;
        const alert = landedAlert({
          planId: p.id,
          flightNo: live?.flight_no ?? opt?.flight_no ?? null,
          destinationIata: (p.destination ?? "").trim().toUpperCase() || null,
          live,
          checkedAt: p.live_checked_at,
          now: new Date(now),
        });
        if (!alert) continue;

        if (layoverPlanId === p.id) {
          /* The layover heads-up speaks for this touchdown — provided it was
             actually written. If a dedupe kept it from landing, this touchdown
             still earns its own note. */
          const { data: lay } = await sb.from("nudges").select("id")
            .eq("user_id", userId).eq("kind", "journey_moved")
            .eq("related_entity_id", p.id).ilike("body", "You are on the ground%").limit(1);
          if ((lay ?? []).length) continue;
        }

        const dedupe = alert.dedupeKey;
        const orgId = (p as unknown as { organization_id?: string | null }).organization_id ?? null;

        /* Told already, on any surface? Then this touchdown has been announced. */
        const { data: told } = await sb.from("deliveries").select("id")
          .eq("user_id", userId).eq("dedupe_key", `nudge:${dedupe}`).eq("status", "sent").limit(1);
        if ((told ?? []).length) continue;

        /* The nudge Today reads — written once, reached until it lands somewhere. */
        let nudgeId: string | null = null;
        const { data: seenNudge } = await sb.from("nudges").select("id")
          .eq("user_id", userId).eq("dedupe_key", dedupe).limit(1);
        if ((seenNudge ?? []).length) {
          nudgeId = (seenNudge[0] as { id: string }).id;
        } else {
          const { data: row } = await sb.from("nudges").insert({
            user_id: userId,
            organization_id: orgId,
            kind: "flight_landed",
            title: alert.title,
            body: alert.detail,
            priority: 60,
            status: "pending",
            related_entity_type: "flight_plan",
            related_entity_id: p.id,
            dedupe_key: dedupe,
          } as never).select("id").maybeSingle();
          nudgeId = (row as { id?: string } | null)?.id ?? null;
          if (nudgeId) {
            /* Receipt: the touchdown is a recorded event, not only a nudge. */
            await writeAuditEvent(sb as never, {
              actor: userId,
              organizationId: orgId,
              entityType: "flight_plan",
              entityId: p.id,
              event: "journey.landed",
              source: "journey_watch",
              metadata: { title: alert.title, nudge_id: nudgeId },
            });
          }
        }
        if (!nudgeId) continue;

        /* Quiet hours hold the note, never lose it: no claim is made while they
           run, so the next sweep tries again until it reaches a surface. */
        const gate = await reachGate(sb, userId);
        if (!gate.allowed) continue;
        const surface = await reachOnce(sb, {
          userId,
          organizationId: orgId,
          nudgeId,
          title: alert.title,
          detail: alert.detail,
          url: "/flights",
          changeKey: dedupe,
          urgency: "time_sensitive",
          entityType: "flight_plan",
          entityId: p.id,
          source: "journey_watch",
          situationKind: "nudge.flight_landed",
          dedupeKey: `nudge:${dedupe}`,
          because: "a confirmed flight touched down and the person asked to hear about it",
          openKind: "today",
          messagingAllowed: gate.messagingAllowed,
        });
        if (surface) pinged += 1;
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
