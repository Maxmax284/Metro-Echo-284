// delivery/reach — the one place a sweep is allowed to reach a person.
//
// Doctrine:
//   - One event, one claim, one surface. The unique index on
//     (user, dedupe key, surface) is the referee: a second claim for the same
//     news loses and nothing is sent twice.
//   - Phone first when a device is registered, Telegram when it is not or the
//     push failed. Never both for one change.
//   - Every reach leaves a receipt, including a failed one.
//   - Nothing reached this way executes anything. Buttons carry a status back
//     into Metro Echo, where the person decides.
import { sendWebPush } from "../webpush.ts";
import { chatIdForUser, sendTelegram } from "../telegramApi.ts";
import { attentionButtons, keyboard, openButton, type VantaLinkKind } from "../telegramReplies.ts";
import { planDelivery, pushPayload } from "./rail.ts";
import {
  applyFloor,
  applyQuietHours,
  categoryForSituation,
  levelForUrgency,
  pushUrgencyHeader,
  readFloors,
  readQuietHours,
  type FloorDecision,
  type NotifyCategory,
} from "../notifyPolicy.ts";
import { isInQuietHours } from "../drift.ts";

/**
 * The ladder gate. Every reach passes here before a device is touched:
 * informational stays in Today, and a per-category floor can hold an
 * important item back to Today or the digest. Critical always punches
 * through. A hold is a status with a receipt, never silence.
 */
export async function floorGate(
  admin: any,
  args: {
    userId: string;
    organizationId?: string | null;
    urgency: string;
    entityType: string;
    entityId?: string | null;
    category?: NotifyCategory | null;
    source: string;
  },
): Promise<FloorDecision> {
  const { data: prof } = await admin
    .from("profiles")
    .select("preferences, timezone")
    .eq("id", args.userId)
    .maybeSingle();
  const prefs = (prof?.preferences as Record<string, unknown>) ?? null;
  const floors = readFloors(prefs);
  const category = args.category ?? categoryForSituation(args.entityType);
  let decision = applyFloor({ urgency: args.urgency, category, floors });
  /* The quiet window holds everything but the urgent — the person's own hours,
     not a hardcoded night. The hold gets the same receipt any other hold gets. */
  const quiet = readQuietHours(prefs);
  const tz = (prof as { timezone?: string } | null)?.timezone || "UTC";
  const wasPush = decision.channel === "push";
  decision = applyQuietHours({
    decision,
    inQuietHours: isInQuietHours(tz, quiet.start, quiet.end),
  });
  if (decision.channel !== "push") {
    await admin.from("audit_log").insert({
      user_id: args.userId,
      organization_id: args.organizationId ?? null,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      event: "nudge.held_by_settings",
      payload: {
        channel: decision.channel,
        /* The floor said push and the window said wait — quiet hours did this. */
        held_reason: wasPush && decision.channel !== "push" ? "quiet_hours" : "floor",
        level: decision.level,
        category: decision.category,
        urgency: args.urgency,
        because: decision.because,
        source: args.source,
      },
    });
  }
  return decision;
}

export type ClaimInput = {
  userId: string;
  organizationId?: string | null;
  situationKind: string;
  situationId: string;
  /** Already namespaced, e.g. `nudge:<dedupe key>`. */
  dedupeKey: string;
  surface: "phone" | "messaging" | "today";
  urgency: string;
  headline: string;
  because: string;
};

/** Claim the right to deliver this exact change on this exact surface. */
export async function claimDelivery(admin: any, input: ClaimInput): Promise<string | null> {
  const { data, error } = await admin.from("deliveries").insert({
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    situation_kind: input.situationKind,
    situation_id: input.situationId,
    dedupe_key: input.dedupeKey,
    surface: input.surface,
    urgency: input.urgency,
    sensitivity: "ordinary",
    because: input.because,
    headline: input.headline,
    status: "sent",
  }).select("id").maybeSingle();
  /* A duplicate key means this news already went out. Silence is correct. */
  if (error || !data?.id) return null;
  return data.id as string;
}

export function pushConfigured(): boolean {
  return !!(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY") && Deno.env.get("VAPID_SUBJECT"));
}

/** Does this person have a registered device at all? Decides phone vs Telegram. */
export async function hasPushDevice(admin: any, userId: string): Promise<boolean> {
  if (!pushConfigured()) return false;
  const { data } = await admin.from("push_subscriptions").select("id").eq("user_id", userId).limit(1);
  return (data ?? []).length > 0;
}

export type ReachInput = {
  userId: string;
  organizationId?: string | null;
  /** The conclusion, first. */
  title: string;
  /** One line of why. */
  detail: string;
  /** Where in Metro Echo this situation lives, including any ack params. */
  url: string;
  /** What changed — becomes the notification tag. */
  changeKey: string;
  urgency: string;
  entityType: string;
  entityId: string | null;
  /** Which sweep spoke, for the receipt. */
  source: string;
  /** Notification category. Derived from entityType when absent. */
  category?: NotifyCategory | null;
  /** Skip the floor gate — reachOnce already applied it. */
  gateApplied?: boolean;
};

/**
 * Push to every registered device. Dead endpoints are dropped, live ones are
 * stamped, and the whole attempt lands in the audit log either way.
 */
export async function reachPhone(admin: any, input: ReachInput): Promise<boolean> {
  if (!input.gateApplied) {
    const gate = await floorGate(admin, {
      userId: input.userId,
      organizationId: input.organizationId,
      urgency: input.urgency,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      source: input.source,
    });
    /* Held or not push-worthy: the situation stays where the person finds it. */
    if (gate.channel !== "push") return false;
  }
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return false;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", input.userId);
  if (!subs?.length) return false;

  const plan = planDelivery({
    situation: { id: input.entityId ?? input.changeKey, kind: input.entityType, url: input.url },
    urgency: (input.urgency as never) ?? "attention",
    sensitivity: "ordinary",
    headline: input.title,
    detail: input.detail,
    changeKey: input.changeKey,
    context: { pushOptIn: true, pushSubscribed: true },
  });
  const payload = pushPayload(plan);

  let sent = 0;
  let failed = 0;
  const header = pushUrgencyHeader(levelForUrgency(input.urgency));
  for (const s of subs as any[]) {
    const r = await sendWebPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload,
      { vapidPublicKey, vapidPrivateKey, vapidSubject, urgency: header },
    );
    if (r.ok) {
      sent++;
      await admin.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq("id", s.id);
    } else if (r.shouldDelete) {
      await admin.from("push_subscriptions").delete().eq("id", s.id);
    } else {
      failed++;
      /* The count is the stale-endpoint signal — it has to move on every
         failure, or the diagnostic can never tell a sick device from a well
         one. */
      await admin.from("push_subscriptions")
        .update({ last_error: r.error ?? `status ${r.status}`, failure_count: (s.failure_count ?? 0) + 1 })
        .eq("id", s.id);
    }
  }

  await admin.from("audit_log").insert({
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    event: sent > 0 ? "nudge.delivered" : "nudge.delivery_failed",
    payload: { channel: "phone", urgency: input.urgency, sent, failed, source: input.source },
  });
  return sent > 0;
}

/**
 * Reach the linked chat with the same note Today already has. The buttons are
 * acknowledgement only — tapping Got it or Later settles the SAME nudge and the
 * same delivery row the app reads, so Today's signal clears from the chat.
 */
export async function reachMessagingNudge(admin: any, input: ReachInput & {
  nudgeId: string;
  openKind?: VantaLinkKind;
  openUrl?: string;
  openLabel?: string;
}): Promise<boolean> {
  if (!Deno.env.get("TELEGRAM_API_KEY")) return false;
  const chatId = await chatIdForUser(admin, input.userId);
  if (!chatId) return false;

  const open = input.openUrl
    ? { text: input.openLabel ?? "Open in Metro Echo", url: input.openUrl }
    : openButton(input.openKind ?? "today", input.openLabel ? { label: input.openLabel } : {});

  const res = await sendTelegram({
    admin,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    chatId,
    text: `${input.title}\n\n${input.detail}`,
    replyMarkup: keyboard(attentionButtons(input.nudgeId), [open]),
    kind: "notice",
    entityType: input.entityType,
    entityId: input.entityId,
    auditEvent: "nudge.reached_messaging",
    auditFailedEvent: "nudge.reach_messaging_failed",
    auditPayload: { urgency: input.urgency, title: input.title, source: input.source },
  });
  if (!res.ok) console.error(`${input.source} telegram reach failed`, res.reason);
  return res.ok;
}

/**
 * Phone first, Telegram second, and only one of them for one change. Returns
 * the surface that actually carried it, or null when nothing did.
 */
export async function reachOnce(admin: any, input: ReachInput & {
  nudgeId: string;
  situationKind: string;
  dedupeKey: string;
  because: string;
  openKind?: VantaLinkKind;
  openUrl?: string;
  openLabel?: string;
  /** False when the person has not opted into Telegram awareness pings. */
  messagingAllowed?: boolean;
}): Promise<"phone" | "messaging" | null> {
  /* One gate for both surfaces: a floor that holds an item back holds the
     phone buzz and the Telegram ping. The Today nudge is already there. */
  const gate = await floorGate(admin, {
    userId: input.userId,
    organizationId: input.organizationId,
    urgency: input.urgency,
    entityType: input.entityType,
    entityId: input.entityId,
    category: input.category ?? categoryForSituation(input.situationKind),
    source: input.source,
  });
  if (gate.channel !== "push") return null;

  const order: Array<"phone" | "messaging"> = (await hasPushDevice(admin, input.userId))
    ? ["phone", "messaging"]
    : ["messaging", "phone"];

  for (const surface of order) {
    if (surface === "messaging" && input.messagingAllowed === false) continue;
    const claimId = await claimDelivery(admin, {
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      situationKind: input.situationKind,
      situationId: input.entityId ?? input.dedupeKey,
      dedupeKey: input.dedupeKey,
      surface,
      urgency: input.urgency,
      headline: input.title,
      because: input.because,
    });
    if (!claimId) return null; /* Already delivered — one event, one delivery. */

    const ok = surface === "phone"
      ? await reachPhone(admin, { ...input, gateApplied: true })
      : await reachMessagingNudge(admin, input);
    if (ok) return surface;

    await admin.from("deliveries")
      .update({ status: "failed", failure: `${surface} was not reachable` })
      .eq("id", claimId);
  }
  return null;
}
