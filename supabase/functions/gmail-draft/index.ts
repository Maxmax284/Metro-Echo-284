// gmail-draft — a reply you wrote, held until you say send.
//
// Doctrine:
//   - Echo may prepare. Only a person may send. `intent: "send"` requires an
//     explicit `confirmed: true` from a surface that showed the exact text.
//   - Sending is its own Google permission. If it was never granted, this says
//     so and asks for it rather than failing quietly or sending some other way.
//   - Both outcomes leave a receipt: prepared, and sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { callGoogle } from "../_shared/googleService.ts";
import { adminClient } from "../_shared/appUserConnections.ts";
import { GOOGLE_MAIL_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { buildRawReply, replySubject } from "../_shared/mailRead.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";
import { chatText, MODELS } from "../_shared/aiGateway.ts";

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

    const body = (await readJson(req)) as {
      intent?: "compose" | "draft" | "send";
      their_text?: string;
      their_name?: string;
      to?: string;
      subject?: string;
      text?: string;
      thread_id?: string | null;
      in_reply_to?: string | null;
      references?: string | null;
      confirmed?: boolean;
      organization_id?: string | null;
    } | null;

    const intent = body?.intent === "send" ? "send" : body?.intent === "compose" ? "compose" : "draft";

    /* A starting point, only when a person asked for one. It is never saved,
       never sent, and the words stay editable before anything leaves. */
    if (intent === "compose") {
      const theirText = String(body?.their_text ?? "").slice(0, 8000).trim();
      if (!theirText) return jsonResponse({ error: "there is nothing to reply to" }, 400);
      const res = await chatText(
        [
          {
            role: "system",
            content:
              "Draft a short, warm, plain reply to this email. Keep it under 120 words. "
              + "No exclamation marks, no corporate filler, no subject line, no signature block. "
              + "If the email asks a question you cannot answer, leave an obvious blank in square brackets.",
          },
          { role: "user", content: `From ${String(body?.their_name ?? "them")}:\n\n${theirText}` },
        ],
        { model: MODELS.fast },
      );
      if (!res.ok) return jsonResponse({ error: "Echo could not write a starting point just now." }, 502);
      return jsonResponse({ ok: true, suggestion: res.data });
    }
    const to = String(body?.to ?? "").trim();
    const text = String(body?.text ?? "").trim();
    const subject = replySubject(String(body?.subject ?? "").trim() || "(no subject)");

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return jsonResponse({ error: "who is it going to?" }, 400);
    if (!text) return jsonResponse({ error: "there is nothing written yet" }, 400);
    if (text.length > 50_000) return jsonResponse({ error: "that is too long to send" }, 400);
    if (intent === "send" && body?.confirmed !== true) {
      return jsonResponse({ error: "a send has to be approved on the screen that shows the text" }, 400);
    }

    const raw = buildRawReply({
      to,
      subject,
      body: text,
      inReplyTo: body?.in_reply_to ?? null,
      references: body?.references ?? null,
    });
    const threadId = body?.thread_id ? String(body.thread_id) : null;
    const admin = adminClient();
    const orgId = typeof body?.organization_id === "string" ? body.organization_id : null;

    /* A send is never performed here. It becomes one approval in Work, carrying
       the exact words, and actions-execute is the only thing that can post it. */
    if (intent === "send") {
      const proposal = buildMailProposal({
        to,
        toName: body?.their_name ?? null,
        subject,
        body: text,
        threadId,
        inReplyTo: body?.in_reply_to ?? null,
        references: body?.references ?? null,
      });
      const row = buildActionRow({
        userId: user.id,
        organizationId: orgId,
        title: mailProposalTitle(proposal),
        description: mailProposalDescription(proposal),
        risk: "high",
        status: "staged",
        source: "mail",
        payload: proposal as unknown as Record<string, unknown>,
      });
      const { data: staged, error: stageErr } = await admin
        .from("actions")
        .insert(row as never)
        .select("id")
        .single();
      if (stageErr || !staged) {
        console.error("[gmail-draft] could not stage the reply:", stageErr?.message);
        return jsonResponse({ error: "Could not line that up for approval. Nothing was sent." }, 502);
      }
      await writeAuditEvent(admin as never, {
        actor: user.id,
        organizationId: orgId,
        entityType: "action",
        entityId: staged.id,
        event: "gmail.send.staged",
        source: "app",
        success: true,
        metadata: { to, subject, thread_id: threadId },
      });
      return jsonResponse({ ok: true, sent: false, staged: true, action_id: staged.id });
    }

    const res = await callGoogle(user.id, GOOGLE_MAIL_CONNECTOR_ID, "/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: threadId ? { raw, threadId } : { raw } }),
    });
    if (!res.ok) {
      return jsonResponse(
        { error: res.reason === "not_connected" ? "Gmail is not switched on." : "Could not save that draft." },
        res.reason === "not_connected" ? 403 : 502,
      );
    }
    const draft = res.body as { id?: string };
    await writeAuditEvent(admin as never, {
      actor: user.id,
      organizationId: orgId,
      entityType: "message",
      entityId: null,
      event: "gmail.draft.prepared",
      source: "app",
      success: true,
      metadata: { to, subject, draft_id: draft.id ?? null },
    });
    return jsonResponse({ ok: true, sent: false, draft_id: draft.id ?? null });
  } catch (e) {
    console.error("[gmail-draft]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
