import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// telegram-link: mint a one-time pairing code for the signed-in user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


function makeCode() {
  // 6 chars, ambiguous letters removed
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) s += a[b % a.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const code = makeCode();
    const { error } = await supabase
      .from("telegram_link_codes")
      .insert({ code, user_id: user.id });
    if (error) throw error;

    // Resolve bot username for a friendly deep link
    let botUsername: string | null = null;
    try {
      const r = await fetch("https://connector-gateway.lovable.dev/telegram/getMe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
          "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const j = await r.json();
      botUsername = j?.result?.username ?? null;
    } catch { /* ignore */ }

    return new Response(JSON.stringify({
      code,
      bot_username: botUsername,
      deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
