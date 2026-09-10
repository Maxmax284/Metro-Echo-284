// app-user-oauth-start — begin a person's own Google Calendar consent.
//
// Nothing is stored here. The browser only receives a provider consent URL to
// open in a popup; the key comes back later through app-user-oauth-complete.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { authorizeAppUserOAuth } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { GOOGLE_CALENDAR_CONNECTOR_ID, GOOGLE_CALENDAR_SCOPES } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/calendarConnection.ts";

const ALLOWED_ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

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

    const clientAPIKey = Deno.env.get("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY");
    if (!clientAPIKey) {
      return jsonResponse({ error: "Google sign-in is not configured for this app yet." }, 500);
    }

    const body = (await readJson(req)) as { origin?: string } | null;
    const origin = String(body?.origin ?? "").trim();
    if (!ALLOWED_ORIGIN.test(origin)) return jsonResponse({ error: "bad origin" }, 400);

    const returnUrl = new URL("/oauth/google-calendar/return", origin).toString();
    const existing = await getConnectionKeyForUser(user.id, GOOGLE_CALENDAR_CONNECTOR_ID).catch(() => null);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GOOGLE_CALENDAR_CONNECTOR_ID,
      appUserId: user.id,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_CALENDAR_SCOPES },
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
