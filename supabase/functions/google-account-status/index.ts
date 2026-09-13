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
    const { data: rows } = await admin
      .from("app_user_connections")
      .select("connector_id, account_label, last_error")
      .eq("user_id", user.id);
    type Row = { connector_id: string; account_label: string | null; last_error: string | null };
    const mine = new Map<string, Row>(((rows ?? []) as Row[]).map((r) => [r.connector_id, r]));

    /* Calendar keeps its own recorded sync failure. Mail and files record theirs
       on their own connection row, so one refused service never reddens another. */
    const { data: feed } = await admin
      .from("calendar_feeds")
      .select("last_error")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    const calendarError = (feed as { last_error?: string | null } | null)?.last_error ?? null;

    const services: GoogleServiceStatus[] = GOOGLE_CONNECTOR_IDS.map((service) => {
      const row = mine.get(service);
      const connected = !!row;
      const problem = service === "google_calendar"
        ? (row?.last_error ?? null) || calendarError
        : row?.last_error ?? null;
      const failing = connected && !!problem;
      return {
        service,
        connected,
        offerable: !!Deno.env.get(GOOGLE_CLIENT_KEY_ENV[service]),
        account: row?.account_label ?? null,
        failing,
        detail: failing
          ? (service === "google_calendar"
            ? "Google stopped answering for your calendar."
            : "Google stopped answering for this one. Switch it on again.")
          : null,
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
