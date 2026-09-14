// echo-calendar — the calendar Echo owns.
//
// Create, edit and delete an entry here. The row is Echo's own; Google is a
// mirror that can be switched off. When the mirror is on, the push happens with
// the entry (the person asked for it once, in Settings, rather than per entry)
// and the outcome is recorded on the row instead of being assumed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { googleCalendarConnection } from "../_shared/calendarConnection.ts";
import {
  deleteEchoEventFromGoogle,
  normalizeEchoEvent,
  pushEchoEventToGoogle,
  type EchoEventRow,
} from "../_shared/echoCalendar.ts";

const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, all_day, location, description, project_id, organization_id, origin, google_event_id, google_calendar_id, sync_state, sync_error, synced_at, uid";

type Body = {
  op?: "create" | "update" | "delete";
  id?: string;
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  project_id?: string | null;
  organization_id?: string | null;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, sb as never);
    if (!user) return unauthorized();

    const body = ((await readJson(req)) ?? {}) as Body;
    const op = body.op ?? "create";

    const { data: profile } = await sb
      .from("profiles")
      .select("timezone, preferences")
      .eq("id", user.id)
      .maybeSingle();
    const timezone = (profile?.timezone as string) || "UTC";
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    /* Mirroring is on unless the person turned it off. Turning it off never
       deletes an entry here, and never removes what Google already holds. */
    const mirrorWanted = prefs.echo_calendar_google_sync !== false;
    const conn = mirrorWanted ? await googleCalendarConnection(user.id) : null;

    if (op === "delete") {
      if (!body.id) return jsonResponse({ error: "Which entry?" }, 400);
      const { data: row, error: readErr } = await sb
        .from("calendar_events")
        .select(EVENT_COLUMNS)
        .eq("id", body.id)
        .eq("origin", "echo")
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) return jsonResponse({ error: "That entry is not one Echo can edit." }, 404);

      let mirrored: "removed" | "left" | "failed" = "left";
      if (conn && row.google_event_id) {
        try {
          await deleteEchoEventFromGoogle(conn, row.google_event_id as string, (row.google_calendar_id as string) ?? "primary");
          mirrored = "removed";
        } catch {
          mirrored = "failed";
        }
      }
      const { error: delErr } = await sb.from("calendar_events").delete().eq("id", body.id);
      if (delErr) throw delErr;

      await sb.from("audit_log").insert({
        user_id: user.id,
        organization_id: row.organization_id ?? null,
        entity_type: "calendar_event",
        entity_id: body.id,
        event: "calendar.event_deleted",
        payload: { title: row.title, google: mirrored },
      });
      return jsonResponse({ ok: true, deleted: true, google: mirrored });
    }

    const norm = normalizeEchoEvent({
      title: body.title ?? "",
      starts_at: body.starts_at ?? "",
      ends_at: body.ends_at ?? null,
      all_day: body.all_day,
      location: body.location ?? null,
      description: body.description ?? null,
      project_id: body.project_id ?? null,
      organization_id: body.organization_id ?? null,
    });
    if (!norm.ok) return jsonResponse({ error: norm.error }, 400);
    const v = norm.value;

    let row: Record<string, unknown> | null = null;

    if (op === "update") {
      if (!body.id) return jsonResponse({ error: "Which entry?" }, 400);
      const { data, error } = await sb
        .from("calendar_events")
        .update({
          title: v.title,
          starts_at: v.starts_at,
          ends_at: v.ends_at,
          all_day: v.all_day,
          location: v.location,
          description: v.description,
          project_id: v.project_id,
        })
        .eq("id", body.id)
        .eq("origin", "echo")
        .select(EVENT_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "That entry is not one Echo can edit." }, 404);
      row = data as Record<string, unknown>;
    } else {
      const { data, error } = await sb
        .from("calendar_events")
        .insert({
          user_id: user.id,
          organization_id: v.organization_id ?? null,
          feed_id: null,
          origin: "echo",
          uid: `echo-${crypto.randomUUID()}`,
          title: v.title,
          starts_at: v.starts_at,
          ends_at: v.ends_at,
          all_day: v.all_day,
          location: v.location,
          description: v.description,
          project_id: v.project_id,
          sync_state: "local",
        })
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw error;
      row = data as Record<string, unknown>;
    }

    // The mirror, when it is on and reachable.
    let google: { state: string; event_id?: string; error?: string } = {
      state: mirrorWanted ? (conn ? "pending" : "not_connected") : "off",
    };
    if (conn && row) {
      try {
        const pushed = await pushEchoEventToGoogle(conn, row as unknown as EchoEventRow, timezone);
        const { data: synced } = await sb
          .from("calendar_events")
          .update({
            google_event_id: pushed.event_id,
            google_calendar_id: pushed.calendar_id,
            sync_state: "synced",
            sync_error: null,
            synced_at: new Date().toISOString(),
          })
          .eq("id", row.id as string)
          .select(EVENT_COLUMNS)
          .maybeSingle();
        if (synced) row = synced as Record<string, unknown>;
        google = { state: "synced", event_id: pushed.event_id };
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        await sb
          .from("calendar_events")
          .update({ sync_state: "error", sync_error: message.slice(0, 200) })
          .eq("id", row.id as string);
        google = { state: "error", error: message.slice(0, 200) };
      }
    } else if (!mirrorWanted && row) {
      await sb.from("calendar_events").update({ sync_state: "off" }).eq("id", row.id as string);
    }

    await sb.from("audit_log").insert({
      user_id: user.id,
      organization_id: (row?.organization_id as string) ?? null,
      entity_type: "calendar_event",
      entity_id: (row?.id as string) ?? null,
      event: op === "update" ? "calendar.event_edited" : "calendar.event_created",
      payload: { title: v.title, starts_at: v.starts_at, google: google.state },
    });

    return jsonResponse({ ok: true, event: row, google });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
