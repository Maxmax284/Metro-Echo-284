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
  leaseUntil,
  nextCheckAt,
  OPEN_STATES,
  settleFromAction,
  settleFromCalendar,
  type CheckResult,
  type WatchRow,
} from "../_shared/watch.ts";
import { fetchPage } from "../_shared/webFetch.ts";
import { checkPage, checkSearch } from "../_shared/webLook.ts";
import { serpSearch } from "../_shared/serpSearch.ts";
import { firstLine, sitrepFrom } from "../_shared/sitrep.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();

    /* One caller may sweep only their own watches; the cron sweeps everyone.
       A person pressing "Check now" forces their own open watches checked
       right now, due or not — waiting for the schedule when you asked is a
       dead button. A forced check never leaves the caller's own rows. */
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

    const body = (await req.json().catch(() => ({}))) as { watch_id?: unknown; force?: unknown };
    const onlyWatchId = typeof body?.watch_id === "string" ? body.watch_id : null;
    const wantsForce = body?.force === true;

    let q = admin
      .from("watches")
      .select("*")
      .in("state", ["on_it", "watching", "waiting"]);
    if (onlyWatchId) {
      if (!onlyUserId) return jsonResponse({ error: "Sign in to check a watch." }, 401);
      q = q.eq("id", onlyWatchId).eq("user_id", onlyUserId).limit(1);
    } else if (wantsForce && onlyUserId) {
      q = q.eq("user_id", onlyUserId).order("next_check_at", { ascending: true }).limit(25);
    } else {
      q = q.lte("next_check_at", now.toISOString()).limit(200);
      if (onlyUserId) q = q.eq("user_id", onlyUserId);
    }
    const forced = !!onlyWatchId || (wantsForce && !!onlyUserId);

    const { data, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);

    const rows = (data ?? []) as WatchRow[];
    if (onlyWatchId && rows.length === 0) {
      return jsonResponse({ ok: false, error: "That watch is not open any more." }, 404);
    }
    let checked = 0;
    let settled = 0;

    let skipped = 0;
    const results: Array<{ id: string; state: string; outcome: string | null }> = [];

    /* One timezone lookup per person, so the outcome reads in their own clock. */
    const zones = new Map<string, string | null>();
    const zoneFor = async (userId: string): Promise<string | null> => {
      if (zones.has(userId)) return zones.get(userId) ?? null;
      const { data } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
      const tz = (data as { timezone?: string | null } | null)?.timezone ?? null;
      zones.set(userId, tz);
      return tz;
    };

    for (const row of rows) {
      if (!forced && !isDue(row, now)) continue;

      /* Claim the row before checking it. Two overlapping sweeps cannot both
         win this update, so the same watch is never checked twice at once. */
      const { data: claimed } = await admin
        .from("watches")
        .update({ next_check_at: leaseUntil(now), updated_at: now.toISOString() })
        .eq("id", row.id)
        .eq("next_check_at", row.next_check_at)
        .in("state", OPEN_STATES)
        .select("id");
      if (!claimed || claimed.length === 0) {
        skipped += 1;
        continue;
      }

      checked += 1;
      const attempts = row.attempts + 1;

      /* What Echo actually saw, so the radar can show a real headline instead
         of a bare "nothing moved". Written only when a read really happened. */
      let lastRead: string | null = null;

      let result: CheckResult = { state: row.state, outcome: null };

      if (row.kind === "action_settled" && row.subject_id) {
        const { data: action } = await admin
          .from("actions")
          .select("status")
          .eq("id", row.subject_id)
          .maybeSingle();
        result = settleFromAction((action as { status?: string } | null)?.status ?? null);
      } else if (row.kind === "calendar_event" && (row.subject_id || row.success_when?.uid)) {
        /* Identity is the feed's own uid, not the database row: sync replaces
           rows, and a replaced row must never be reported as "gone". */
        const uid = String(row.success_when?.uid ?? "");
        let ev: { title: string | null; starts_at: string; ends_at: string | null } | null = null;
        if (uid) {
          const { data: byUid } = await admin
            .from("calendar_events")
            .select("title, starts_at, ends_at")
            .eq("user_id", row.user_id)
            .eq("uid", uid)
            .order("starts_at", { ascending: true })
            .limit(1);
          ev = (byUid?.[0] as never) ?? null;
        }
        if (!ev && row.subject_id) {
          const { data: byId } = await admin
            .from("calendar_events")
            .select("title, starts_at, ends_at")
            .eq("id", row.subject_id)
            .maybeSingle();
          ev = (byId as never) ?? null;
        }
        const expected = String(row.success_when?.fingerprint ?? "");
        const misses = Number(row.success_when?.misses ?? 0);

        if (!ev && misses < 2) {
          /* A sync in progress can briefly leave no row. One empty look is not
             news: wait, count it, and only call it gone if it stays gone. */
          result = { state: "watching", outcome: null };
          await admin
            .from("watches")
            .update({ success_when: { ...row.success_when, misses: misses + 1 } })
            .eq("id", row.id);
        } else {
          result = settleFromCalendar(
            expected || calendarFingerprint(ev as never),
            (ev as never) ?? null,
            await zoneFor(row.user_id),
          );
          /* First check with no baseline: record what "unchanged" means. Also
             clear a miss streak the moment the entry is back. */
          if (ev) {
            await admin
              .from("watches")
              .update({
                success_when: {
                  ...row.success_when,
                  fingerprint: expected || calendarFingerprint(ev as never),
                  misses: 0,
                },
              })
              .eq("id", row.id);
          }
        }
      } else if (row.kind === "web_page") {
        /* One public page, read the same way every time. Silence when nothing
           moved; one plain sentence when it did. Echo never signs in, so a page
           that turns into a login wall ends the watch honestly. */
        const url = String(row.success_when?.url ?? "");
        if (!url) {
          result = { state: "couldnt_finish", outcome: "That watch has no page address on it." };
        } else {
          const got = await fetchPage(url);
          if (!got.ok) {
            const misses = Number(row.success_when?.misses ?? 0) + 1;
            if (misses >= 3) {
              result = { state: "couldnt_finish", outcome: got.line };
            } else {
              result = { state: "watching", outcome: null };
              await admin
                .from("watches")
                .update({ success_when: { ...row.success_when, misses } })
                .eq("id", row.id);
            }
          } else {
            lastRead = String(got.read.title ?? got.read.host).slice(0, 140);
            const checked = checkPage(
              { url, fingerprint: (row.success_when?.fingerprint as string | null) ?? null },
              got.read,
            );
            if ("failed" in checked) {
              result = { state: "couldnt_finish", outcome: checked.outcome };
            } else if (checked.changed) {
              result = { state: "needs_you", outcome: checked.outcome };
              /* Today already reads nudges, so a real change lands where the
                 person already looks — one row, deduped per page per day. */
              const { error: nudgeError } = await admin.from("nudges").upsert({
                user_id: row.user_id,
                organization_id: row.organization_id ?? null,
                kind: "web_page_changed",
                title: checked.outcome,
                body: `${row.goal}. Echo read the page, nothing else. Open it to see what moved.`,
                priority: 65,
                related_entity_type: "watch",
                related_entity_id: row.id,
                dedupe_key: `web.page.changed:${row.id}:${now.toISOString().slice(0, 10)}`,
                status: "pending",
                expires_at: new Date(now.getTime() + 3 * 86400_000).toISOString(),
              }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
              if (nudgeError) console.error("[watch-sweep] page nudge", nudgeError.message);
              await admin
                .from("watches")
                .update({ success_when: { ...row.success_when, fingerprint: checked.fingerprint, misses: 0 } })
                .eq("id", row.id);
            } else {
              result = { state: "watching", outcome: null };
              await admin
                .from("watches")
                .update({
                  success_when: { ...row.success_when, fingerprint: checked.fingerprint, misses: 0 },
                })
                .eq("id", row.id);
            }
          }
        }
      } else if (row.kind === "web_search") {
        /* A topic watch re-asks the same question and compares the set of
           pages answering it. The same pages in a new order is ranking jitter,
           not news. When the set moves — or the board has no read yet — Echo
           actually reads the reporting and speaks the verdict; the fingerprint
           stays the cheap pre-filter so quiet checks cost no AI call. */
        const query = String(row.success_when?.query ?? "");
        if (!query) {
          result = { state: "couldnt_finish", outcome: "That watch has no question on it." };
        } else {
          try {
            const hits = await serpSearch(query, Deno.env.get("SERPAPI_KEY") ?? "");
            const checked = checkSearch(
              { fingerprint: (row.success_when?.fingerprint as string | null) ?? null },
              query,
              hits,
            );
            /* A failed synthesis never blocks the check: fall back to the raw
               headline, and never overwrite a good verdict with a worse one. */
            const needsVoice = checked.changed || !row.last_read;
            const verdict = needsVoice
              ? await sitrepFrom(query, hits, Deno.env.get("LOVABLE_API_KEY") ?? "")
              : "";
            if (verdict) lastRead = verdict.slice(0, 400);
            else if (!row.last_read && hits[0]?.title) lastRead = hits[0].title.slice(0, 140);
            if (checked.changed) {
              const headline = verdict ? firstLine(verdict) : checked.outcome;
              result = { state: "needs_you", outcome: headline };
              /* Same rail as a page change: Today already reads nudges, one
                 row, deduped per watch per day. */
              const { error: nudgeError } = await admin.from("nudges").upsert({
                user_id: row.user_id,
                organization_id: row.organization_id ?? null,
                kind: "web_page_changed",
                title: headline,
                body: verdict
                  ? `${verdict} Open the radar for the sources.`
                  : `${row.goal}. Echo read public results, nothing else. Ask Echo what is new to see what moved.`,
                priority: 65,
                related_entity_type: "watch",
                related_entity_id: row.id,
                dedupe_key: `web.search.changed:${row.id}:${now.toISOString().slice(0, 10)}`,
                status: "pending",
                expires_at: new Date(now.getTime() + 3 * 86400_000).toISOString(),
              }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
              if (nudgeError) console.error("[watch-sweep] search nudge", nudgeError.message);
              await admin
                .from("watches")
                .update({
                  success_when: {
                    ...row.success_when,
                    fingerprint: checked.fingerprint,
                    misses: 0,
                    hits: hits.slice(0, 3).map((h) => h.title),
                  },
                })
                .eq("id", row.id);
            } else {
              result = { state: "watching", outcome: null };
              await admin
                .from("watches")
                .update({
                  success_when: { ...row.success_when, fingerprint: checked.fingerprint, misses: 0 },
                })
                .eq("id", row.id);
            }
          } catch (e) {
            console.error("[watch-sweep] search check", e);
            const misses = Number(row.success_when?.misses ?? 0) + 1;
            if (misses >= 3) {
              result = { state: "couldnt_finish", outcome: "Echo could not reach the web search for that watch." };
            } else {
              result = { state: "watching", outcome: null };
              await admin
                .from("watches")
                .update({ success_when: { ...row.success_when, misses } })
                .eq("id", row.id);
            }
          }
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
          ...(lastRead ? { last_read: lastRead } : {}),
        })
        .eq("id", row.id);

      results.push({ id: row.id, state: finalState, outcome: finalOutcome });

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
        /* A watch that reached couldnt_finish in the sweep failed on its own —
           a user stop never passes through here. Failure says so out loud. */
        if (finalState === "couldnt_finish") {
          const { error: nudgeError } = await admin.from("nudges").upsert({
            user_id: row.user_id,
            organization_id: row.organization_id ?? null,
            kind: "watch_failed",
            title: "Echo couldn't keep watching that.",
            body: `${row.goal}. ${finalOutcome ?? "It ended without an answer."}`,
            priority: 60,
            related_entity_type: "watch",
            related_entity_id: row.id,
            dedupe_key: `watch.failed:${row.id}`,
            status: "pending",
            expires_at: new Date(now.getTime() + 3 * 86400_000).toISOString(),
          }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
          if (nudgeError) console.error("[watch-sweep] failed nudge", nudgeError.message);
        }
      } else {
        /* A quiet check still leaves a receipt: Receipts proves the silence
           was earned, never presents it as proof nothing happened. */
        await writeAuditEvent(admin as never, {
          actor: row.user_id,
          organizationId: row.organization_id,
          entityType: "watch",
          entityId: row.id,
          event: "watch.checked",
          source: "watch-sweep",
          previousState: row.state,
          nextState: finalState,
          success: true,
          metadata: { goal: row.goal, kind: row.kind, attempts, changed: false },
        });
      }
    }

    return jsonResponse({ ok: true, checked, settled, skipped, results });
  } catch (e) {
    console.error("[watch-sweep]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
