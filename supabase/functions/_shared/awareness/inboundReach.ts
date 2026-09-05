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

const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

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

  let ok = false;
  let err: string | null = null;
  try {
    const r = await fetch(`${TG_GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
        "X-Connection-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    ok = r.ok;
    if (!ok) err = JSON.stringify(await r.json().catch(() => ({}))).slice(0, 200);
    else {
      const j = await r.json().catch(() => ({} as any));
      if (j && j.ok === false) {
        ok = false;
        err = String(j.description ?? "telegram rejected the message").slice(0, 200);
      }
    }
  } catch (e) {
    err = e instanceof Error ? e.message : "send failed";
  }

  await admin.from("audit_log").insert({
    user_id: input.ownerId,
    entity_type: "capture",
    entity_id: input.captureId,
    event: ok ? "nudge.reached_messaging" : "nudge.reach_messaging_failed",
    payload: {
      channel: "telegram",
      source: "inbound_signal",
      source_platform: input.sourcePlatform,
      event_type: input.eventType,
      urgency,
      title: detail.title,
      idempotency_key: input.idempotencyKey,
      ...(err ? { error: err } : {}),
    },
  });

  return ok ? done("sent", true) : done("send_failed");
}
