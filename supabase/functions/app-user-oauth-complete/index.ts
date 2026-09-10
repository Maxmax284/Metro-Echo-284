// app-user-oauth-complete — turn the one-time code into this person's stored key.
//
// Then it does the useful thing immediately: makes sure they have a Google
// calendar feed and pulls it in, so Today has real entries before they look.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { callAsAppUser, exchangeAppUserOAuthCode } from "../_shared/appUserConnector.ts";
import { adminClient, saveConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { GOOGLE_CALENDAR_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { GATEWAY_BASE_URL } from "../_shared/calendarConnection.ts";

/** Which Google account this is, in the person's own words: their address. */
async function primaryAccountLabel(connectionAPIKey: string): Promise<string | null> {
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: GOOGLE_CALENDAR_CONNECTOR_ID,
      path: "/calendar/v3/calendars/primary",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string; summary?: string };
    return body.id ?? body.summary ?? null;
  } catch {
    return null;
  }
}

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

    const body = (await readJson(req)) as { code?: string; organization_id?: string | null } | null;
    const code = String(body?.code ?? "").trim();
    if (!code || code.length > 4096) return jsonResponse({ error: "missing code" }, 400);

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, code);
    if (connectorId !== GOOGLE_CALENDAR_CONNECTOR_ID) {
      return jsonResponse({ error: "that sign-in was for a different service" }, 400);
    }

    const label = await primaryAccountLabel(connectionAPIKey);
    await saveConnectionKeyForUser(user.id, connectorId, connectionAPIKey, label);

    // One Google feed per person and room. It carries provider identity, so
    // Telegram and Today read exactly what Google holds.
    const admin = adminClient();
    const orgId = typeof body?.organization_id === "string" ? body.organization_id : null;
    let feedQuery = admin
      .from("calendar_feeds")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "google");
    feedQuery = orgId ? feedQuery.eq("organization_id", orgId) : feedQuery.is("organization_id", null);
    const { data: existingFeed } = await feedQuery.maybeSingle();

    let feedId = existingFeed?.id as string | undefined;
    if (!feedId) {
      const { data: inserted, error } = await admin
        .from("calendar_feeds")
        .insert({
          user_id: user.id,
          organization_id: orgId,
          provider: "google",
          label: label ? `Google Calendar (${label})` : "Google Calendar",
          url: null,
          active: true,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      feedId = inserted!.id as string;
    } else if (label) {
      await admin
        .from("calendar_feeds")
        .update({ label: `Google Calendar (${label})`, active: true })
        .eq("id", feedId);
    }

    return jsonResponse({ ok: true, account: label, feed_id: feedId });
  } catch (e) {
    console.error("[app-user-oauth-complete]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
