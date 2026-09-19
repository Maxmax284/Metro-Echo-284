// google-account-status — the truth about ONE person's Google account.
//
// Doctrine: a status may only report this person's own grants. The builder's
// workspace connection keeps calendar reads working, but it must never render as
// "you are connected" on somebody else's screen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { adminClient } from "../_shared/appUserConnections.ts";
import { GOOGLE_CLIENT_KEY_ENV } from "../_shared/appUserScopes.ts";
import { callGoogle } from "../_shared/googleService.ts";
import {
  googleServiceStatuses,
  type ConnectionRow,
  type GoogleServiceStatus,
} from "../_shared/googleHealth.ts";

export type { GoogleServiceStatus };


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
    const { data: fetched } = await admin
      .from("app_user_connections")
      .select("connector_id, account_label, last_error")
      .eq("user_id", user.id);
    let rows = fetched;

    /* A red mark is a claim about NOW, not a scar from days ago. Re-ask Google
       once, cheaply, for any service carrying a recorded error: a healthy
       answer clears the mark (callGoogle records the OK), a refusal re-stamps
       it with today's reason. One read-only probe per marked service. */
    const PROBE: Record<string, string> = {
      google_calendar: "/calendar/v3/users/me/calendarList?maxResults=1",
      google_mail: "/gmail/v1/users/me/profile",
      google_drive: "/drive/v3/about?fields=user",
    };
    const marked = (rows ?? []).filter((r) => r.last_error && PROBE[r.connector_id]);
    if (marked.length > 0) {
      await Promise.all(marked.map((r) => callGoogle(user.id, r.connector_id as never, PROBE[r.connector_id])));
      const { data: fresh } = await admin
        .from("app_user_connections")
        .select("connector_id, account_label, last_error")
        .eq("user_id", user.id);
      rows = fresh;
    }

    /* Calendar keeps its own recorded sync failure. Mail and files record theirs
       on their own connection row, so one refused service never reddens another. */
    const { data: feed } = await admin
      .from("calendar_feeds")
      .select("last_error, active")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    const calFeed = feed as { last_error?: string | null; active?: boolean | null } | null;
    const calendarError = calFeed?.last_error ?? null;

    const services: GoogleServiceStatus[] = googleServiceStatuses({
      rows: (rows ?? []) as ConnectionRow[],
      offerable: (service) => !!Deno.env.get(GOOGLE_CLIENT_KEY_ENV[service]),
      calendarSyncError: calendarError,
      calendarFeedActive: calFeed?.active === true,
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
