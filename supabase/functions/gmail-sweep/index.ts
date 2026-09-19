// gmail-sweep — the one background job that reads mail, and only booking mail.
//
// Doctrine:
//   - Opt-in per person, off until switched on. No mailbox is ever swept because
//     Gmail merely happens to be connected.
//   - It asks a narrow question (bookings, inside a window), reads headers in one
//     batched request, and opens a body only when that message's own subject or
//     sender says it carries one.
//   - Recognition is not ownership. Everything it finds becomes a draft with the
//     mail as its evidence, plus one question when whose flight it is cannot be
//     read. Nothing lands on a board, nothing executes, nothing is booked.
//   - The same message is never looked at twice, and the day has a ceiling.
//   - It reports a diff, never a status. A run that found nothing says nothing.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { callGoogle, hasGoogleService } from "../_shared/googleService.ts";
import { GOOGLE_MAIL_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { connectionLabelForUser } from "../_shared/appUserConnections.ts";
import { noticeFlights } from "../_shared/flightNotice.ts";
import { plainTextFromPayload, toMailItem, type MailItem } from "../_shared/mailRead.ts";
import { batchBoundary, buildMetadataBatch, parseBatch, BATCH_MAX } from "../_shared/gmailBatch.ts";
import {
  candidateQuery,
  emptyCounts,
  isBookingish,
  MAIL_DAILY_CEILING,
  SKIP_LABELS,
  SWEEP_LOOK_MAX,
  SWEEP_OPEN_MAX,
  sweepDiff,
  type SweepCounts,
} from "../_shared/mailSweep.ts";

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Readings this person's sweeps have already spent today. */
async function spentToday(sb: SupabaseClient, userId: string): Promise<number> {
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await sb
    .from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", "google_mail")
    .eq("feature", "mail.sweep")
    .gte("created_at", dayStart);
  return count ?? 0;
}

async function receipt(
  sb: SupabaseClient,
  userId: string,
  status: string,
  detail?: string,
): Promise<void> {
  await sb.from("api_usage_logs").insert({
    owner_id: userId,
    user_id: userId,
    provider: "google_mail",
    feature: "mail.sweep",
    request_type: "gmail",
    status,
    cache_hit: false,
    error_message: detail ?? null,
  } as never);
}

type SweepResult = SweepCounts & { reason?: string };

async function sweepUser(sb: SupabaseClient, userId: string, orgId: string | null): Promise<SweepResult> {
  const counts = emptyCounts();

  if (!(await hasGoogleService(userId, GOOGLE_MAIL_CONNECTOR_ID))) {
    return { ...counts, reason: "gmail_not_connected" };
  }
  if ((await spentToday(sb, userId)) >= MAIL_DAILY_CEILING) {
    return { ...counts, reason: "day_ceiling" };
  }

  const { data: state } = await sb
    .from("mail_sync_state")
    .select("history_id, backfilled_at")
    .eq("user_id", userId)
    .maybeSingle();
  const historyId = (state?.history_id as string | null) ?? null;

  /* First run reads a bounded window of booking-shaped mail. Later runs read
     only what changed since — that is what keeps an hourly job cheap. */
  let ids: string[] = [];
  if (!historyId) {
    const res = await callGoogle(
      userId,
      GOOGLE_MAIL_CONNECTOR_ID,
      `/gmail/v1/users/me/messages?maxResults=${SWEEP_LOOK_MAX}&q=${encodeURIComponent(candidateQuery(14))}`,
    );
    await receipt(sb, userId, res.ok ? "success" : "failed", res.ok ? undefined : res.detail);
    if (!res.ok) return { ...counts, reason: res.reason };
    ids = (((res.body as { messages?: { id?: string }[] } | null)?.messages) ?? [])
      .map((m) => String(m.id ?? ""))
      .filter(Boolean);
  } else {
    const res = await callGoogle(
      userId,
      GOOGLE_MAIL_CONNECTOR_ID,
      `/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(historyId)}`
        + "&historyTypes=messageAdded&maxResults=200",
    );
    await receipt(sb, userId, res.ok ? "success" : "failed", res.ok ? undefined : res.detail);
    if (!res.ok) {
      /* An expired bookmark is not a failure; the next run starts a fresh
         window rather than pretending the mailbox went quiet. */
      if (res.status === 404) {
        await sb.from("mail_sync_state").update({ history_id: null }).eq("user_id", userId);
        return { ...counts, reason: "history_expired" };
      }
      return { ...counts, reason: res.reason };
    }
    const body = res.body as { history?: { messagesAdded?: { message?: { id?: string; labelIds?: string[] } }[] }[] } | null;
    const seen = new Set<string>();
    for (const h of body?.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        const m = added.message;
        if (!m?.id) continue;
        if ((m.labelIds ?? []).some((l) => SKIP_LABELS.includes(l))) continue;
        seen.add(String(m.id));
      }
    }
    ids = [...seen].slice(0, SWEEP_LOOK_MAX);
  }

  if (ids.length) {
    const { data: already } = await sb
      .from("mail_seen")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", ids);
    const known = new Set(((already ?? []) as { message_id: string }[]).map((r) => r.message_id));
    ids = ids.filter((id) => !known.has(id));
  }
  counts.looked = ids.length;
  if (!ids.length) {
    await sb.from("mail_sync_state").update({ last_swept_at: new Date().toISOString(), last_error: null })
      .eq("user_id", userId);
    return counts;
  }

  /* Headers for every new id in ONE request. Fifty subject lines, one call. */
  const items: MailItem[] = [];
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const slice = ids.slice(i, i + BATCH_MAX);
    const boundary = batchBoundary(`${userId}${i}`);
    const { contentType, body } = buildMetadataBatch(slice, boundary);
    const res = await callGoogle(userId, GOOGLE_MAIL_CONNECTOR_ID, "/batch/gmail/v1", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    await receipt(sb, userId, res.ok ? "success" : "failed", res.ok ? undefined : res.detail);
    if (!res.ok) return { ...counts, reason: res.reason };
    /* callGoogle hands back the raw text when the answer is not JSON, which a
       multipart answer never is. */
    const parts = parseBatch(contentType, typeof res.body === "string" ? res.body : "");
    for (const part of parts) {
      if (part.status < 200 || part.status >= 300 || !part.body) {
        counts.failed++;
        continue;
      }
      items.push(toMailItem(part.body as never));
    }
  }

  const label = await connectionLabelForUser(userId, GOOGLE_MAIL_CONNECTOR_ID);
  const myEmails = label && label.includes("@") ? [label] : [];
  const candidates = items.filter((m) => isBookingish(m)).slice(0, SWEEP_OPEN_MAX);
  const opened = new Set<string>();
  const recognised = new Set<string>();

  for (const m of candidates) {
    const full = await callGoogle(
      userId,
      GOOGLE_MAIL_CONNECTOR_ID,
      `/gmail/v1/users/me/messages/${m.id}?format=full`,
    );
    await receipt(sb, userId, full.ok ? "success" : "failed", full.ok ? undefined : full.detail);
    if (!full.ok) {
      counts.failed++;
      continue;
    }
    opened.add(m.id);
    counts.opened++;
    const payload = (full.body as { payload?: unknown } | null)?.payload;
    const text = `${m.subject}\n${plainTextFromPayload(payload as never).slice(0, 20_000)}`;
    try {
      const out = await noticeFlights(sb as never, { userId, orgId }, {
        text,
        source: "mail",
        sender: { name: m.fromName || null, email: m.from || null },
        /* Back to the original, in Gmail, whenever they want to check. */
        link: `https://mail.google.com/mail/u/0/#all/${m.id}`,
        myEmails,
      });
      counts.created += out.created;
      counts.asked += out.asked;
      counts.filled += out.filled.length;
      counts.conflicts += out.conflicts.length;
      if (out.created || out.filled.length || out.conflicts.length) recognised.add(m.id);
    } catch (e) {
      console.error("[gmail-sweep] notice", e instanceof Error ? e.message : e);
    }
  }

  /* Every id looked at is remembered, so nothing is ever read twice. The subject
     line is kept so Receipts can say where a flight came from; no body is. */
  const rows = ids.map((id) => {
    const hit = items.find((m) => m.id === id);
    return {
      user_id: userId,
      message_id: id,
      subject: hit?.subject ?? null,
      from_address: hit?.from ?? null,
      outcome: recognised.has(id) ? "recognised" : opened.has(id) ? "opened" : "looked",
    };
  });
  await sb.from("mail_seen").upsert(rows, { onConflict: "user_id,message_id", ignoreDuplicates: true });

  /* Move the bookmark forward so the next run reads changes, not the mailbox. */
  const profile = await callGoogle(userId, GOOGLE_MAIL_CONNECTOR_ID, "/gmail/v1/users/me/profile");
  await receipt(sb, userId, profile.ok ? "success" : "failed", profile.ok ? undefined : profile.detail);
  const nextHistory = profile.ok
    ? String((profile.body as { historyId?: string | number } | null)?.historyId ?? "") || null
    : null;
  await sb.from("mail_sync_state").update({
    history_id: nextHistory ?? historyId,
    backfilled_at: state?.backfilled_at ?? new Date().toISOString(),
    last_swept_at: new Date().toISOString(),
    last_error: null,
  }).eq("user_id", userId);

  /* One receipt for the run, and only when something actually changed. */
  const diff = sweepDiff(counts);
  if (diff) {
    await sb.from("audit_log").insert({
      user_id: userId,
      organization_id: orgId,
      entity_type: "mail",
      entity_id: null,
      event: "mail.swept",
      payload: { ...counts, said: diff, source: "gmail_sweep" },
    });
  }
  return counts;
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const sb = admin();
    const body = (await readJson(req)) as { user_id?: string } | null;

    let query = sb.from("mail_sync_state").select("user_id").eq("enabled", true);
    if (body?.user_id) query = query.eq("user_id", body.user_id);
    const { data: rows, error } = await query.limit(200);
    if (error) return jsonResponse({ error: error.message }, 500);

    const out: Record<string, unknown>[] = [];
    for (const row of (rows ?? []) as { user_id: string }[]) {
      try {
        const counts = await sweepUser(sb, row.user_id, null);
        out.push({ user_id: row.user_id, ...counts });
      } catch (e) {
        const detail = e instanceof Error ? e.message : "unknown";
        console.error("[gmail-sweep]", row.user_id, detail);
        await sb.from("mail_sync_state").update({ last_error: detail }).eq("user_id", row.user_id);
        out.push({ user_id: row.user_id, error: detail });
      }
    }

    return jsonResponse({ ok: true, swept: out.length, users: out });
  } catch (e) {
    console.error("[gmail-sweep]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
