// telegram-status — one honest answer to "is my Telegram bot actually working?"
//
// Reads only. It checks four things in order and reports each one plainly:
//   1. is a bot connected at all (is the connection key present)
//   2. is the inbound pipe open (Telegram's own webhook info)
//   3. is a chat paired to this account
//   4. has anything real gone in or out, and when
//
// Nothing here registers, sends, or writes app data. It cannot execute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tg(method: string, body?: unknown) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
      "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, raw };
}

const INBOUND_EVENTS = [
  "telegram.message_in",
  "telegram.linked",
  "telegram.unlinked",
  "telegram.callback",
];

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

    const keyPresent = Boolean(Deno.env.get("TELEGRAM_API_KEY"));
    const expectedWebhook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;

    let bot: { username: string | null; name: string | null } = { username: null, name: null };
    let webhook: Record<string, unknown> = {};
    let gatewayError: string | null = null;

    if (keyPresent) {
      const me = await tg("getMe");
      if (me.ok && me.json?.result) {
        bot = { username: me.json.result.username ?? null, name: me.json.result.first_name ?? null };
      } else {
        gatewayError = me.json?.description ?? me.raw?.slice(0, 200) ?? `HTTP ${me.status}`;
      }
      const info = await tg("getWebhookInfo");
      const r = info.json?.result ?? {};
      webhook = {
        url: r.url ?? null,
        points_here: typeof r.url === "string" && r.url === expectedWebhook,
        pending_update_count: r.pending_update_count ?? 0,
        last_error_message: r.last_error_message ?? null,
        last_error_at: r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : null,
        allowed_updates: r.allowed_updates ?? null,
      };
    }

    const [links, channel, inbound, outbound, captures] = await Promise.all([
      admin.from("telegram_chat_links")
        .select("id, chat_id, tg_username, linked_at")
        .eq("user_id", user.id)
        .order("linked_at", { ascending: false }),
      admin.from("user_channel_links")
        .select("default_route, channel")
        .eq("user_id", user.id)
        .eq("channel", "telegram")
        .maybeSingle(),
      admin.from("audit_log")
        .select("event, payload, created_at")
        .eq("user_id", user.id)
        .in("event", INBOUND_EVENTS)
        .order("created_at", { ascending: false })
        .limit(15),
      admin.from("audit_log")
        .select("event, payload, created_at")
        .eq("user_id", user.id)
        .in("event", ["telegram.test_sent", "telegram.reminder_sent", "telegram.notice_sent"])
        .order("created_at", { ascending: false })
        .limit(5),
      admin.from("audit_log")
        .select("event, payload, created_at")
        .eq("user_id", user.id)
        .eq("event", "capture.routed")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const telegramCaptures = (captures.data ?? [])
      .filter((r: any) => (r.payload ?? {}).source === "telegram")
      .slice(0, 10)
      .map((r: any) => ({
        at: r.created_at,
        destination: r.payload?.destination ?? "memory",
        note_id: r.payload?.note_id ?? null,
        action_id: r.payload?.action_id ?? null,
        commitment_id: r.payload?.commitment_id ?? null,
      }));

    return json({
      bot_connected: keyPresent,
      bot,
      gateway_error: gatewayError,
      webhook,
      expected_webhook: expectedWebhook,
      links: links.data ?? [],
      route: channel.data?.default_route ?? null,
      last_in: (inbound.data ?? []).find((r: any) => r.event === "telegram.message_in")?.created_at ?? null,
      last_out: (outbound.data ?? [])[0]?.created_at ?? null,
      last_out_event: (outbound.data ?? [])[0]?.event ?? null,
      recent_inbound: (inbound.data ?? []).map((r: any) => ({
        at: r.created_at,
        event: r.event,
        chat_id: r.payload?.chat_id ?? null,
        preview: typeof r.payload?.text === "string" ? String(r.payload.text).slice(0, 120) : null,
      })),
      recent_captures: telegramCaptures,
    });
  } catch (e) {
    console.error("telegram-status error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
