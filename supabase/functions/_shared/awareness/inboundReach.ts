// Inbound reach — the "seconds, not an hour" path.
//
// The hourly sweep is fine for drift. It is useless for a booking that just
// changed or a payment that just failed. When a signed external signal lands,
// we evaluate it right here and, if it earns it, reach the user immediately.
//
// Consent is unchanged and double-gated: proactive awareness on, Telegram
// pref on, and a linked chat. Quiet hours are honoured; only `critical`
// signals may break them. The item is always in the inbox first — messaging is
// notification only and can never approve or execute anything.
import { isInQuietHours } from "../drift.ts";
import { sendTelegram } from "../telegramApi.ts";
import { compactWhy, whyFor } from "../whySurfaced.ts";
import { readBrandVoice, styleNotice } from "../brandVoice.ts";
import type { Urgency } from "./urgency.ts";
import {
  buildSignalDetail,
  inboundNoticeText,
  inboundUrgency,
  shouldReachNow,
  type SignalDetail,
} from "./inbound.ts";


export type InboundReachResult = {
  reached: boolean;
  reason:
    | "sent"
    | "urgency_below_threshold"
    | "awareness_off"
    | "shadow_mode"
    | "messaging_off"
    | "not_linked"
    | "quiet_hours"
    | "connector_missing"
    | "send_failed";
  urgency: Urgency;
};

export async function reachInboundSignal(
  admin: any,
  input: {
    ownerId: string;
    displayName: string;
    sourcePlatform: string;
    eventType: string;
    payload: Record<string, unknown>;
    captureId: string;
    idempotencyKey: string;
  },
): Promise<InboundReachResult> {
  const urgency = inboundUrgency(input.eventType, input.payload);
  const detail: SignalDetail = buildSignalDetail(input.displayName, input.eventType, input.payload);

  const done = (reason: InboundReachResult["reason"], reached = false): InboundReachResult => ({
    reached,
    reason,
    urgency,
  });

  if (!shouldReachNow(urgency)) return done("urgency_below_threshold");

  const { data: profile } = await admin
    .from("profiles")
    .select("timezone, preferences")
    .eq("id", input.ownerId)
    .maybeSingle();
  const prefs = ((profile?.preferences ?? {}) as Record<string, unknown>) ?? {};
  if (prefs.proactive_awareness_enabled !== true) return done("awareness_off");
  if (prefs.awareness_shadow_mode === true) return done("shadow_mode");
  if (prefs.telegram_awareness_enabled !== true) return done("messaging_off");

  const tz = (profile?.timezone as string) || "UTC";
  const quiet = isInQuietHours(
    tz,
    (prefs.quiet_hours_start as string) ?? "22:00",
    (prefs.quiet_hours_end as string) ?? "07:00",
    new Date(),
  );
  if (quiet && urgency !== "critical") return done("quiet_hours");

  const { data: link } = await admin
    .from("telegram_chat_links")
    .select("chat_id")
    .eq("user_id", input.ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const chatId = (link as { chat_id?: number } | null)?.chat_id;
  if (!chatId) return done("not_linked");

  const apiKey = Deno.env.get("TELEGRAM_API_KEY");
  if (!apiKey) return done("connector_missing");

  /*
   * Same reveal as the screen, compressed to one line. A notice that cannot say
   * why it arrived has no business interrupting anyone.
   */
  const whyLine = compactWhy(
    whyFor({
      source: input.sourcePlatform,
      whatChanged: detail.title,
      reason: `${input.eventType.replace(/[._]/g, " ")} came in and reads as ${urgency}.`,
      at: new Date().toISOString(),
      whyItMatters: "It is in the inbox for review.",
    }),
  );

  const text = styleNotice(
    `${inboundNoticeText(detail, {
      publicUrl: Deno.env.get("VANTA_PUBLIC_URL"),
      nextStep: "In Metro Echo's inbox for review — nothing was actioned.",
    })}\n\nWhy you're seeing this: ${whyLine}`,
    readBrandVoice(prefs),
  );

  /* One outbound path: sends, records the message on the thread, writes the receipt. */
  const res = await sendTelegram({
    admin,
    userId: input.ownerId,
    chatId,
    text,
    kind: "notice",
    entityType: "capture",
    entityId: input.captureId,
    auditEvent: "nudge.reached_messaging",
    auditFailedEvent: "nudge.reach_messaging_failed",
    auditPayload: {
      source: "inbound_signal",
      source_platform: input.sourcePlatform,
      event_type: input.eventType,
      urgency,
      title: detail.title,
      idempotency_key: input.idempotencyKey,
    },
  });

  return res.ok ? done("sent", true) : done("send_failed");
}
