// google-calendar-disconnect — hand the account back.
//
// The provider connection goes first, then the stored key, then the feed and its
// entries. Nothing lingers pretending Echo can still see the calendar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { disconnectAppUser } from "../_shared/appUserConnector.ts";
import {
  adminClient,
  forgetConnectionForUser,
  getConnectionKeyForUser,
} from "../_shared/appUserConnections.ts";
import { GOOGLE_CALENDAR_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/calendarConnection.ts";

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

    const key = await getConnectionKeyForUser(user.id, GOOGLE_CALENDAR_CONNECTOR_ID).catch(() => null);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: GOOGLE_CALENDAR_CONNECTOR_ID,
        });
      } catch (e) {
        console.error("[google-calendar-disconnect] gateway", e);
      }
    }
    await forgetConnectionForUser(user.id, GOOGLE_CALENDAR_CONNECTOR_ID);

    const admin = adminClient();
    const { data: feeds } = await admin
      .from("calendar_feeds")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "google");
    for (const f of feeds ?? []) {
      await admin.from("calendar_events").delete().eq("feed_id", f.id);
      await admin.from("calendar_feeds").delete().eq("id", f.id);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[google-calendar-disconnect]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
