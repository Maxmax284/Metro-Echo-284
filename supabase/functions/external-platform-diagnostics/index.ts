// external-platform-diagnostics: owner-only safe status for inbound platform webhooks.
// Never returns raw secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { EXTERNAL_PLATFORMS, fingerprintSecret } from "../_shared/externalPlatform.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) return json({ error: "unauthorized" }, 401);

  const { data: isOwner } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "owner",
  });
  if (!isOwner) return json({ error: "forbidden" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ownerId = userData.user.id;

  const [{ data: diagnostics }, { data: secrets }, { data: controls }] = await Promise.all([
    admin.from("external_platform_webhook_diagnostics").select("*").eq("owner_id", ownerId),
    admin.from("integration_webhook_secrets").select("integration_key,secret_name,secret_value").eq("owner_id", ownerId),
    admin.from("system_controls").select("gth_enabled,campcore_enabled,fenrir_enabled").eq("owner_id", ownerId).maybeSingle(),
  ]);

  const diagBySource = new Map((diagnostics ?? []).map((row: any) => [row.source_platform, row]));
  const secretByName = new Map((secrets ?? []).map((row: any) => [row.secret_name, row]));

  const rows = await Promise.all(EXTERNAL_PLATFORMS.map(async (platform) => {
    const diag: any = diagBySource.get(platform.sourcePlatform) ?? {};
    const saved: any = secretByName.get(platform.secretName);
    const envSecret = Deno.env.get(platform.secretName);
    const secretValue = saved?.secret_value ?? envSecret ?? null;
    const enabled = platform.killSwitchKey ? !!controls?.[platform.killSwitchKey] : true;

    return {
      source_platform: platform.sourcePlatform,
      display_name: platform.displayName,
      webhook_configured: !!secretValue,
      secret_fingerprint: secretValue ? await fingerprintSecret(secretValue) : null,
      secret_storage_source: saved?.integration_key && saved.integration_key !== platform.sourcePlatform ? "wrong_source" : secretValue ? "configured" : "missing",
      expected_secret_name: platform.secretName,
      allowed_event_types: platform.allowedEvents,
      enabled,
      last_received_at: diag.last_received_at ?? null,
      last_accepted_at: diag.last_accepted_at ?? null,
      last_rejected_at: diag.last_rejected_at ?? null,
      last_rejection_reason: diag.last_rejection_reason ?? null,
      last_event_type: diag.last_event_type ?? null,
      last_idempotency_key: diag.last_idempotency_key ?? null,
      signature_status: diag.signature_status ?? "unknown",
      last_health_status: enabled ? diag.last_health_status ?? "unknown" : "disabled",
    };
  }));

  return json({ platforms: rows });
});