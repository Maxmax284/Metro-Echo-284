// reminder-send-now — send one promise reminder to Telegram on request.
//
// Doctrine: this is a notification, not an execution. It sends the exact same
// message the scheduled sweep sends (shared composer), writes a receipt, and
// changes no promise state.
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeReminder, sendTelegramReminder } from "../_shared/reminderMessage.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, asUser as any);
    if (!user) return unauthorized();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: user.id, _bucket: "reminder-send-now", _limit: 6, _window_seconds: 300,
    });
    if (allowed === false) {
      return json({ error: "Give it a few minutes before sending another." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const commitmentId = typeof body?.commitment_id === "string" ? body.commitment_id : null;
    if (!commitmentId) return json({ error: "commitment_id required" }, 400);

    const { data: comm } = await admin.from("commitments")
      .select("id, summary, due_at, status, metadata, organization_id, source_note")
      .eq("id", commitmentId).eq("user_id", user.id).maybeSingle();
    if (!comm) return json({ error: "That promise isn't yours or no longer exists." }, 404);
    if (comm.status !== "open") return json({ error: "That promise is already closed." }, 409);

    const { data: link } = await admin.from("telegram_chat_links")
      .select("chat_id").eq("user_id", user.id).maybeSingle();
    if (!link?.chat_id) {
      return json({ error: "No Telegram chat is linked yet. Link it in Connected Accounts." }, 409);
    }

    const { data: prof } = await admin.from("profiles")
      .select("timezone").eq("id", user.id).maybeSingle();
    const tz = prof?.timezone || "UTC";

    let noteTitle: string | null = null;
    let noteSnippet: string | null = null;
    if (comm.source_note) {
      const { data: n } = await admin.from("notes")
        .select("title, body").eq("id", comm.source_note).maybeSingle();
      noteTitle = n?.title ?? null;
      noteSnippet = n?.body ?? null;
    }

    const overdue = !!(comm.due_at && new Date(comm.due_at).getTime() < Date.now());
    const composed = composeReminder(comm.summary, overdue, comm.due_at, tz, {
      noteTitle, noteSnippet, commitmentId: comm.id,
    });
    const sent = await sendTelegramReminder(link.chat_id, composed.text, composed.reply_markup);

    await admin.from("audit_log").insert({
      user_id: user.id,
      organization_id: comm.organization_id ?? null,
      entity_type: "commitment",
      entity_id: comm.id,
      event: sent.ok ? "reminder.telegram_sent" : "reminder.telegram_failed",
      payload: { chat_id: link.chat_id, overdue, manual: true, ...(sent.ok ? {} : { error: sent.err }) },
    });

    if (!sent.ok) return json({ error: sent.err ?? "Telegram wouldn't take it." }, 502);

    const meta = (comm.metadata ?? {}) as Record<string, unknown>;
    await admin.from("commitments")
      .update({ metadata: { ...meta, telegram_sent_at: new Date().toISOString() } })
      .eq("id", comm.id).eq("user_id", user.id);

    return json({ ok: true });
  } catch (e) {
    console.error("reminder-send-now", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
