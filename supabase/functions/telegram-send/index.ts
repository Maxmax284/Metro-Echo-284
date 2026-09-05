// telegram-send — you, from inside Vanta, replying into your own Telegram chat.
//
// This is the one outbound path a person drives by hand. It sends plain text to
// a chat already paired to this account and records the message in the thread so
// the room in Vanta shows the real conversation.
//
// It cannot execute anything: no approvals, no exports, no other people's chats.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const MAX_CHARS = 3500;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const user = await resolveUser(req, admin as any);
    if (!user) return unauthorized();

    const apiKey = Deno.env.get("TELEGRAM_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Telegram is not connected yet." }, 400);

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Nothing to send." }, 400);
    if (text.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 400);

    // Only chats this account has paired. Requested chat must be one of them.
    const { data: links } = await admin.from("telegram_chat_links")
      .select("chat_id")
      .eq("user_id", user.id)
      .order("linked_at", { ascending: false });
    const chats = (links ?? []).map((l: any) => Number(l.chat_id));
    if (!chats.length) return json({ error: "No paired chat yet.", reason: "no_links" }, 400);
    const wanted = body?.chat_id != null ? Number(body.chat_id) : chats[0];
    const chatId = chats.includes(wanted) ? wanted : chats[0];

    const res = await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
        "X-Connection-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const raw = await res.text();
    let out: any = null;
    try { out = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
    const ok = res.ok && out?.ok !== false;
    const reason = ok ? null : (out?.description ?? raw?.slice(0, 200) ?? `HTTP ${res.status}`);

    await admin.from("telegram_messages").insert({
      user_id: user.id,
      chat_id: chatId,
      direction: "out",
      text,
      kind: "text",
      sent_by: "you",
      error: reason,
      meta: { message_id: out?.result?.message_id ?? null },
    });

    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "telegram",
      event: ok ? "telegram.message_out" : "telegram.message_out_failed",
      payload: { chat_id: chatId, chars: text.length, reason },
    });

    if (!ok) {
      console.error(`telegram-send failed [${res.status}]: ${raw}`);
      return json({ sent: false, reason, status: res.status }, res.status === 401 ? 400 : 502);
    }
    return json({ sent: true, chat_id: chatId });
  } catch (e) {
    console.error("telegram-send error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
