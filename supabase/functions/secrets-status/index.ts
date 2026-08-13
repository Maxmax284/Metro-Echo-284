import { corsHeaders } from "../_shared/http.ts";
// secrets-status: returns presence (boolean) of allowlisted secret names.
// Never returns secret values. Auth-gated.
import { createClient } from "npm:@supabase/supabase-js@2";


// Hard allowlist — only these names may be probed.
const ALLOWED = new Set([
  "LOVABLE_API_KEY",
  "TELEGRAM_API_KEY",
  "SERPAPI_KEY",
  "VANTA_PUBLIC_URL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "GTH_WEBHOOK_SECRET",
  "CAMPCORE_WEBHOOK_SECRET",
  "FENRIR_WEBHOOK_SECRET",
  "WEBSITE_FORMS_SECRET",
  "WHATSAPP_PROVIDER_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Owner gate. user_roles + has_role function.
    const { data: isOwner } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "owner",
    });
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let names: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.names)) names = body.names.filter((n: unknown) => typeof n === "string");
    } catch {
      names = [];
    }
    if (names.length === 0) names = Array.from(ALLOWED);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const allowedNames = names.filter((name) => ALLOWED.has(name));
    const { data: savedSecrets } = allowedNames.length > 0
      ? await admin
        .from("integration_webhook_secrets")
        .select("secret_name")
        .eq("owner_id", userData.user.id)
        .in("secret_name", allowedNames)
      : { data: [] as Array<{ secret_name: string }> };
    const saved = new Set((savedSecrets ?? []).map((row) => row.secret_name));

    const result: Record<string, { present: boolean; allowed: boolean }> = {};
    for (const raw of names) {
      const name = String(raw);
      const allowed = ALLOWED.has(name);
      if (!allowed) {
        result[name] = { present: false, allowed: false };
        continue;
      }
      const v = Deno.env.get(name);
      result[name] = { present: (!!v && v.length > 0) || saved.has(name), allowed: true };
    }

    return new Response(JSON.stringify({ secrets: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
