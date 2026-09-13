// app-user-oauth-start — begin a person's own consent for ONE Google service.
//
// Nothing is stored here. The browser only receives a provider consent URL to
// open in a popup; the key comes back later through app-user-oauth-complete.
// One service per consent: granting mail never touches calendar, and reading
// mail never asks for permission to send it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { authorizeAppUserOAuth } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import {
  GOOGLE_CALENDAR_CONNECTOR_ID,
  GOOGLE_CLIENT_KEY_ENV,
  isGoogleConnector,
  scopesForConnector,
  type GoogleConnectorId,
} from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/calendarConnection.ts";

const ALLOWED_ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

const NOT_CONFIGURED: Record<GoogleConnectorId, string> = {
  google_calendar: "Google Calendar is not set up for this app yet.",
  google_mail: "Gmail is not set up for this app yet. An owner has to allow it first.",
  google_drive: "Google Drive is not set up for this app yet. An owner has to allow it first.",
};

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

    const body = (await readJson(req)) as
      | { origin?: string; connector_id?: string; with_send?: boolean }
      | null;

    const requested = String(body?.connector_id ?? GOOGLE_CALENDAR_CONNECTOR_ID);
    if (!isGoogleConnector(requested)) return jsonResponse({ error: "unknown service" }, 400);
    const connectorId = requested;

    const clientAPIKey = Deno.env.get(GOOGLE_CLIENT_KEY_ENV[connectorId]);
    if (!clientAPIKey) return jsonResponse({ error: NOT_CONFIGURED[connectorId] }, 501);

    const origin = String(body?.origin ?? "").trim();
    if (!ALLOWED_ORIGIN.test(origin)) return jsonResponse({ error: "bad origin" }, 400);

    const returnUrl = new URL(`/oauth/google/return?service=${connectorId}`, origin).toString();
    const existing = await getConnectionKeyForUser(user.id, connectorId).catch(() => null);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId,
      appUserId: user.id,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: {
        scopes: scopesForConnector(connectorId, { withSend: body?.with_send === true }),
      },
    });

    return jsonResponse({ authorizationUrl });
  } catch (e) {
    console.error("[app-user-oauth-start]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
