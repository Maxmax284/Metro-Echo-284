// integration-secret-save: owner-only endpoint to save/rotate per-platform webhook secrets.
// Values are write-only from the app: this function never returns the secret value.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED: Record<string, string> = {
  GTH_WEBHOOK_SECRET: "gth",
  CAMPCORE_WEBHOOK_SECRET: "campcore",
  FENRIR_WEBHOOK_SECRET: "fenrir",
  WEBSITE_FORMS_SECRET: "website_forms",
  WHATSAPP_PROVIDER_TOKEN: "whatsapp",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "whatsapp",
};

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

  try {
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

    const body = await req.json().catch(() => null) as { secretName?: unknown; secretValue?: unknown } | null;
    const secretName = typeof body?.secretName === "string" ? body.secretName.trim() : "";
    const secretValue = typeof body?.secretValue === "string" ? body.secretValue.trim() : "";
    const integrationKey = ALLOWED[secretName];

    if (!integrationKey) return json({ error: "secret not allowed" }, 400);
    if (secretValue.length < 16) return json({ error: "secret must be at least 16 characters" }, 400);
    if (secretValue.length > 4096) return json({ error: "secret is too long" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upsertErr } = await admin
      .from("integration_webhook_secrets")
      .upsert({
        owner_id: userData.user.id,
        integration_key: integrationKey,
        secret_name: secretName,
        secret_value: secretValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_id,secret_name" });

    if (upsertErr) return json({ error: "save failed", detail: upsertErr.message }, 500);

    await admin.from("audit_log").insert({
      user_id: userData.user.id,
      entity_type: "integration_secret",
      event: "integration.secret_saved",
      payload: { integration_key: integrationKey, secret_name: secretName },
    });

    return json({ ok: true, secretName, present: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
