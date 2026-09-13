// gmail-read — read the mail that matters, and only that.
//
// Doctrine:
//   - Reading is reading. This function cannot draft, send, label or delete.
//   - Headers by default. The body of a message is only fetched when a person
//     actually opens that one message.
//   - Not connected is said plainly. It never returns an empty list pretending
//     the mailbox is calm.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { callGoogle } from "../_shared/googleService.ts";
import { GOOGLE_MAIL_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import {
  MAIL_QUERY,
  headerValue,
  mailConclusion,
  plainTextFromPayload,
  toMailItem,
  type MailItem,
} from "../_shared/mailRead.ts";

const MAX_LIST = 12;

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

    const body = (await readJson(req)) as { message_id?: string } | null;
    const messageId = String(body?.message_id ?? "").trim();

    /* One message, opened on purpose: this is the only path that reads a body. */
    if (messageId) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return jsonResponse({ error: "bad message" }, 400);
      const one = await callGoogle(
        user.id,
        GOOGLE_MAIL_CONNECTOR_ID,
        `/gmail/v1/users/me/messages/${messageId}?format=full`,
      );
      if (!one.ok) return jsonResponse({ connected: one.reason !== "not_connected", ...one }, 200);
      const msg = one.body as {
        id?: string;
        threadId?: string;
        payload?: { headers?: { name?: string; value?: string }[] };
      };
      const item = toMailItem(msg as never);
      return jsonResponse({
        connected: true,
        message: {
          ...item,
          text: plainTextFromPayload(msg.payload).slice(0, 20_000),
          messageIdHeader: headerValue(msg.payload?.headers, "Message-ID") || null,
          references: headerValue(msg.payload?.headers, "References") || null,
        },
      });
    }

    const list = await callGoogle(
      user.id,
      GOOGLE_MAIL_CONNECTOR_ID,
      `/gmail/v1/users/me/messages?maxResults=${MAX_LIST}&q=${encodeURIComponent(MAIL_QUERY)}`,
    );
    if (!list.ok) {
      return jsonResponse({
        connected: list.reason !== "not_connected",
        reason: list.reason,
        detail: list.detail,
        items: [],
        conclusion: null,
      });
    }

    const ids = (((list.body as { messages?: { id?: string }[] } | null)?.messages) ?? [])
      .map((m) => String(m.id ?? ""))
      .filter(Boolean)
      .slice(0, MAX_LIST);

    const items: MailItem[] = [];
    for (const id of ids) {
      const one = await callGoogle(
        user.id,
        GOOGLE_MAIL_CONNECTOR_ID,
        `/gmail/v1/users/me/messages/${id}?format=metadata`
          + "&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
      );
      if (!one.ok) continue;
      items.push(toMailItem(one.body as never));
    }

    return jsonResponse({
      connected: true,
      items,
      conclusion: mailConclusion(items),
    });
  } catch (e) {
    console.error("[gmail-read]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
