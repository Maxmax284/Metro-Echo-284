// google-disconnect — hand one Google service back.
//
// One service at a time: dropping mail must not quietly take calendar with it.
// The stored key is revoked at the gateway and then forgotten here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { disconnectAppUser } from "../_shared/appUserConnector.ts";
import {
  adminClient,
  forgetConnectionForUser,
  getConnectionKeyForUser,
} from "../_shared/appUserConnections.ts";
import { isGoogleConnector } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE } from "../_shared/googleService.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, sb as never);
    if (!user) return jsonResponse({ error: "sign in required" }, 401);

    const body = (await readJson(req)) as { connector_id?: string } | null;
    const connectorId = String(body?.connector_id ?? "");
    if (!isGoogleConnector(connectorId)) return jsonResponse({ error: "unknown service" }, 400);

    const key = await getConnectionKeyForUser(user.id, connectorId).catch(() => null);
    if (key) {
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE,
        connectionAPIKey: key,
        connectorId,
      }).catch((e) => console.error("[google-disconnect] gateway", e));
    }
    await forgetConnectionForUser(user.id, connectorId);

    await writeAuditEvent(adminClient() as never, {
      actor: user.id,
      entityType: "connection",
      event: "google.service.revoked",
      source: "settings",
      success: true,
      metadata: { service: connectorId },
    });

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[google-disconnect]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
