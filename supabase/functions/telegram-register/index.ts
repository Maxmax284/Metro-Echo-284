// telegram-register — point the Telegram bot at this project's webhook.
//
// Without this, a paired chat still goes nowhere: Telegram has no idea where to
// deliver updates. The secret token is derived exactly the way telegram-webhook
// derives it, so the receiver keeps rejecting anything unsigned.
//
// Capture layer only. Registering a webhook creates no data and executes
// nothing — it just opens the inbound pipe.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function deriveSecret(key: string) {
  const data = new TextEncoder().encode(`telegram-webhook:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

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
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

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

    const secret = await deriveSecret(apiKey);
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;

    const set = await tg("setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });

    const info = await tg("getWebhookInfo");
    const result = (info.json as any)?.result ?? {};

    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "integration",
      event: set.ok ? "telegram.webhook_registered" : "telegram.webhook_register_failed",
      payload: {
        registered: Boolean(set.ok),
        last_error_message: result.last_error_message ?? null,
        pending_update_count: result.pending_update_count ?? null,
      },
    });

    if (!set.ok) {
      return json({
        registered: false,
        reason: (set.json as any)?.description ?? "Telegram refused the registration.",
      });
    }

    return json({
      registered: true,
      pending_update_count: result.pending_update_count ?? 0,
      last_error_message: result.last_error_message ?? null,
      bot_username: result.username ?? null,
    });
  } catch (e) {
    console.error("telegram-register error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
