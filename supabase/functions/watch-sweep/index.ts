// watch-sweep — walks the watches that are due and reports what changed.
//
// It reads recorded state only. It never writes to a calendar, never executes an
// action, never notifies anybody directly. When a watch reaches an end it
// records a receipt through the existing audit rail and the row shows up in
// Work → In motion.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight } from "../_shared/http.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";
import {
  calendarFingerprint,
  exhausted,
  isDue,
  nextCheckAt,
  settleFromAction,
  settleFromCalendar,
  type CheckResult,
  type WatchRow,
} from "../_shared/watch.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();

    /* One caller may sweep only their own watches; the cron sweeps everyone. */
    let onlyUserId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await asUser.auth.getUser();
      onlyUserId = data?.user?.id ?? null;
    }

    let q = admin
      .from("watches")
      .select("*")
      .in("state", ["on_it", "watching", "waiting"])
      .lte("next_check_at", now.toISOString())
      .limit(200);
    if (onlyUserId) q = q.eq("user_id", onlyUserId);

    const { data, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);

    const rows = (data ?? []) as WatchRow[];
    let checked = 0;
    let settled = 0;

    for (const row of rows) {
      if (!isDue(row, now)) continue;
      checked += 1;
      const attempts = row.attempts + 1;

      let result: CheckResult = { state: row.state, outcome: null };

      if (row.kind === "action_settled" && row.subject_id) {
        const { data: action } = await admin
          .from("actions")
          .select("status")
          .eq("id", row.subject_id)
          .maybeSingle();
        result = settleFromAction((action as { status?: string } | null)?.status ?? null);
      } else if (row.kind === "calendar_event" && row.subject_id) {
        const { data: ev } = await admin
          .from("calendar_events")
          .select("title, starts_at, ends_at")
          .eq("id", row.subject_id)
          .maybeSingle();
        const expected = String(row.success_when?.fingerprint ?? "");
        result = settleFromCalendar(
          expected || calendarFingerprint(ev as never),
          (ev as never) ?? null,
        );
        /* First check with no baseline: record what "unchanged" means. */
        if (!expected && ev) {
          await admin
            .from("watches")
            .update({ success_when: { ...row.success_when, fingerprint: calendarFingerprint(ev as never) } })
            .eq("id", row.id);
        }
      } else {
        result = { state: "couldnt_finish", outcome: "There is nothing left to watch." };
      }

      const done = result.state === "done" || result.state === "couldnt_finish";
      const outOfRoad = !done && exhausted({ ...row, attempts }, now);
      const finalState = outOfRoad ? "couldnt_finish" : result.state;
      const finalOutcome = outOfRoad
        ? "Echo checked as long as it was told to and nothing changed."
        : result.outcome;

      await admin
        .from("watches")
        .update({
          state: finalState,
          outcome: finalOutcome,
          attempts,
          last_check_at: now.toISOString(),
          next_check_at: nextCheckAt(row.cadence_minutes, attempts, now),
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);

      if (finalState === "done" || finalState === "couldnt_finish" || finalState === "needs_you") {
        settled += 1;
        await writeAuditEvent(admin as never, {
          actor: row.user_id,
          organizationId: row.organization_id,
          entityType: "watch",
          entityId: row.id,
          event: `watch.${finalState}`,
          source: "watch-sweep",
          previousState: row.state,
          nextState: finalState,
          success: finalState === "done",
          metadata: { goal: row.goal, kind: row.kind, attempts, outcome: finalOutcome },
        });
      }
    }

    return jsonResponse({ ok: true, checked, settled });
  } catch (e) {
    console.error("[watch-sweep]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
