import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// telegram-test: send a one-off test message (with Vanta deep link) to all
// of the signed-in user's linked Telegram chats. Capture layer untouched —
// this only proves end-to-end delivery + deep link works.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

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
    const lines = [
      "Vanta — test reminder",
      "If you see this, Telegram delivery works end-to-end.",
    ];
    if (publicUrl) lines.push(`Open Vanta: ${publicUrl}/`);
    const text = lines.join("\n");

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const l of links) {
      try {
        const r = await fetch(`${TG_GATEWAY}/sendMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
            "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: l.chat_id, text }),
        });
        if (r.ok) {
          sent++;
        } else {
          failed++;
          const j = await r.json().catch(() => ({}));
          errors.push(JSON.stringify(j).slice(0, 160));
        }
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : "send failed");
      }
    }

    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "telegram",
      event: "telegram.test_sent",
      payload: { sent, failed, public_url_present: !!publicUrl, errors: errors.slice(0, 3) },
    });

    return new Response(JSON.stringify({ sent, failed, public_url_present: !!publicUrl, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
