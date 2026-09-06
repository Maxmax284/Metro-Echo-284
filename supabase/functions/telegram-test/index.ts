import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// telegram-test: send a one-off test message (with Echo deep link) to all
// of the signed-in user's linked Telegram chats. Capture layer untouched —
// this only proves end-to-end delivery + deep link works.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildSignalDetail, inboundNoticeText } from "../_shared/awareness/inbound.ts";
import { sendTelegram } from "../_shared/telegramApi.ts";



Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: links } = await admin
      .from("telegram_chat_links")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!links || links.length === 0) {
      return new Response(JSON.stringify({ reason: "no_links", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const publicUrl = (Deno.env.get("VANTA_PUBLIC_URL") ?? "").replace(/\/$/, "");

    // Optional realistic preview: formats exactly like a live inbound notice so
    // the wording can be judged, not just the plumbing. Sample data only.
    let sample: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      sample = typeof body?.sample === "string" ? body.sample : null;
    } catch { /* no body */ }

    let text: string;
    if (sample) {
      const detail = buildSignalDetail("LMT Camp State", "booking.state_changed", {
        guest_name: "Sample Guest",
        room: "Bungalow 3",
        check_in: "2026-08-24",
        check_out: "2026-08-28",
        guests: 2,
        previous_status: "confirmed",
        status: "cancelled",
        amount: "18400",
        currency: "thb",
        booking_reference: "LMT-4471",
        channel: "direct",
      });
      text = `${inboundNoticeText(detail, { publicUrl })}\n\n(Sample notice — test send, no real booking changed.)`;
    } else {
      const lines = [
        "Echo — test reminder",
        "If you see this, Telegram delivery works end-to-end.",
      ];
      if (publicUrl) lines.push(`Open Metro Echo: ${publicUrl}/`);
      text = lines.join("\n");
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const receipts: { chat_id: string; message_id?: number }[] = [];
    for (const l of links) {
      /* One outbound path, so a test message shows up on the thread like any other. */
      const r = await sendTelegram({
        admin,
        userId: user.id,
        chatId: l.chat_id,
        text,
        kind: "notice",
        auditEvent: "telegram.test_message_out",
        auditFailedEvent: "telegram.test_message_out_failed",
      });
      const messageId = typeof r.result?.message_id === "number" ? r.result.message_id : undefined;
      if (r.ok && messageId !== undefined) {
        sent++;
        receipts.push({ chat_id: String(l.chat_id), message_id: messageId });
      } else {
        failed++;
        errors.push(
          (r.reason ??
            "The delivery service accepted it but Telegram never confirmed a message. Re-link this chat: open the bot in Telegram, send /start, then link again.").slice(0, 200),
        );
      }
    }

    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "telegram",
      event: "telegram.test_sent",
      payload: { sent, failed, public_url_present: !!publicUrl, receipts, errors: errors.slice(0, 3) },
    });

    return new Response(JSON.stringify({ sent, failed, public_url_present: !!publicUrl, receipts, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
