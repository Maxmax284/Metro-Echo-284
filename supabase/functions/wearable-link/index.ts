// wearable-link — mint the private link a phone posts watch numbers to.
//
// Signed-in callers only. The token stands for one person and one thing:
// permission to drop readings in. It cannot read, route, approve, or run
// anything. Rotating it retires the old one immediately.
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sign in first." }, 401);
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const user = await resolveUser(req, asUser as any).catch(() => null);
    if (!user) return json({ error: "Sign in first." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json().catch(() => ({}))) as { rotate?: boolean };
    const { data: existing } = await admin
      .from("integration_webhook_secrets")
      .select("id, secret_value")
      .eq("integration_key", "wearable")
      .eq("owner_id", user.id)
      .maybeSingle();

    let token = existing?.secret_value as string | undefined;

    if (!token || body?.rotate) {
      token = mintToken();
      if (existing?.id) {
        await admin
          .from("integration_webhook_secrets")
          .update({ secret_value: token, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await admin.from("integration_webhook_secrets").insert({
          owner_id: user.id,
          integration_key: "wearable",
          secret_name: "Watch hand-off",
          secret_value: token,
        });
      }
      await admin.from("audit_log").insert({
        user_id: user.id,
        entity_type: "wearable",
        event: body?.rotate ? "wearable.link.rotated" : "wearable.link.created",
        payload: {},
      });
    }

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wearable-ingest`;
    return json({ ok: true, url, token });
  } catch (e) {
    console.error("wearable-link", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
