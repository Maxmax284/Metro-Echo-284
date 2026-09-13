// google-account-status — the truth about ONE person's Google account.
//
// Doctrine: a status may only report this person's own grants. The builder's
// workspace connection keeps calendar reads working, but it must never render as
// "you are connected" on somebody else's screen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { adminClient } from "../_shared/appUserConnections.ts";
import {
  GOOGLE_CLIENT_KEY_ENV,
  GOOGLE_CONNECTOR_IDS,
  type GoogleConnectorId,
} from "../_shared/appUserScopes.ts";

export type GoogleServiceStatus = {
  service: GoogleConnectorId;
  /** This person granted it. */
  connected: boolean;
  /** It can be granted right now: the app has the wiring for it. */
  offerable: boolean;
  account: string | null;
  /** Something that was working has stopped. */
  failing: boolean;
  detail: string | null;
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

    const admin = adminClient();
    const { data: rows } = await admin
      .from("app_user_connections")
      .select("connector_id, account_label")
      .eq("user_id", user.id);
    const mine = new Map<string, string | null>(
      ((rows ?? []) as { connector_id: string; account_label: string | null }[]).map((r) => [
        r.connector_id,
        r.account_label,
      ]),
    );

    /* A recorded calendar failure is the one "was working, now needs you" signal
       we already keep. Mail and files have no sweep, so they cannot go stale. */
    const { data: feed } = await admin
      .from("calendar_feeds")
      .select("last_error")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    const calendarError = (feed as { last_error?: string | null } | null)?.last_error ?? null;

    const services: GoogleServiceStatus[] = GOOGLE_CONNECTOR_IDS.map((service) => {
      const connected = mine.has(service);
      const failing = connected && service === "google_calendar" && !!calendarError;
      return {
        service,
        connected,
        offerable: !!Deno.env.get(GOOGLE_CLIENT_KEY_ENV[service]),
        account: mine.get(service) ?? null,
        failing,
        detail: failing ? "Google stopped answering for your calendar." : null,
      };
    });

    const account = services.find((s) => s.connected && s.account)?.account ?? null;

    return jsonResponse({
      signed_in: services.some((s) => s.connected),
      account,
      services,
    });
  } catch (e) {
    console.error("[google-account-status]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
