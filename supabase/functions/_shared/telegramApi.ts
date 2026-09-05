// telegramApi — the ONE outbound Telegram path.
//
// Before this module there were three raw POSTs to the connector gateway: one
// inside the webhook, one in telegram-send, one buried in the drift sweep. Three
// copies meant three different ideas of what gets recorded, so the Telegram room
// inside Metro Echo showed a partial conversation and the audit trail had holes.
//
// Everything outbound now goes through `sendTelegram`, which sends, records the
// message on the thread, and writes the receipt. Nothing here approves or
// executes anything: it moves words.

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export function telegramConfigured(): boolean {
  return !!Deno.env.get("TELEGRAM_API_KEY");
}

function gatewayHeaders(withJson = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
    "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
  };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

export type TgResult = {
  ok: boolean;
  status: number;
  /** Telegram's `result` object when the call succeeded. */
  result: any | null;
  /** Provider wording when it failed — surfaced, never swallowed. */
  reason: string | null;
};

/**
 * Raw Bot API method call. Telegram can report failure inside a 200 body
 * (`{ok:false, description}`), so both the HTTP status and that field are read.
 */
export async function tgCall(method: string, body: unknown): Promise<TgResult> {
  try {
    const r = await fetch(`${GATEWAY}/${method}`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
    const ok = r.ok && parsed?.ok !== false;
    return {
      ok,
      status: r.status,
      result: parsed?.result ?? null,
      reason: ok ? null : (parsed?.description ?? raw.slice(0, 300) ?? `HTTP ${r.status}`),
    };
  } catch (e) {
    return { ok: false, status: 0, result: null, reason: e instanceof Error ? e.message : "send failed" };
  }
}

/** Download a Telegram file by its `file_path` (from `getFile`). */
export function tgFetchFile(filePath: string): Promise<Response> {
  return fetch(`${GATEWAY}/file/${filePath}`, { headers: gatewayHeaders(false) });
}

/** The chat this account most recently paired, or null when none is linked. */
export async function chatIdForUser(admin: any, userId: string): Promise<number | null> {
  const { data } = await admin
    .from("telegram_chat_links")
    .select("chat_id")
    .eq("user_id", userId)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = Number((data as { chat_id?: number } | null)?.chat_id);
  return Number.isFinite(id) ? id : null;
}

export type SendTelegramInput = {
  admin: any;
  userId: string;
  chatId: number | string;
  text: string;
  organizationId?: string | null;
  replyMarkup?: unknown;
  /** Thread classification for the Telegram room: text | page_reply | notice … */
  kind?: string;
  /** "vanta" is the frozen wire value for "Echo sent this"; "you" is the human. */
  sentBy?: "vanta" | "you";
  entityType?: string | null;
  entityId?: string | null;
  /** Audit event names. Defaults describe an Echo reply. */
  auditEvent?: string;
  auditFailedEvent?: string;
  auditPayload?: Record<string, unknown>;
  /** Set false for transport-only calls that must not appear on the thread. */
  record?: boolean;
};

/**
 * Send one message and leave receipts. A send that fails is still recorded, with
 * the provider's own wording in `error`, because a silent failure is how a
 * person ends up trusting a message that never arrived.
 */
export async function sendTelegram(input: SendTelegramInput): Promise<TgResult> {
  const {
    admin, userId, chatId, text, organizationId = null, replyMarkup,
    kind = "text", sentBy = "vanta", entityType = null, entityId = null,
    auditEvent = "telegram.message_out",
    auditFailedEvent = "telegram.message_out_failed",
    auditPayload = {}, record = true,
  } = input;

  const res = await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  if (record) {
    try {
      await admin.from("telegram_messages").insert({
        user_id: userId,
        organization_id: organizationId,
        chat_id: chatId,
        direction: "out",
        text,
        kind,
        sent_by: sentBy,
        entity_type: entityType,
        entity_id: entityId,
        error: res.reason,
        meta: { message_id: res.result?.message_id ?? null },
      });
    } catch (e) {
      console.error("telegram_messages insert", e);
    }
    try {
      await admin.from("audit_log").insert({
        user_id: userId,
        organization_id: organizationId,
        entity_type: entityType ?? "telegram",
        entity_id: entityId,
        event: res.ok ? auditEvent : auditFailedEvent,
        payload: { chat_id: chatId, chars: text.length, kind, ...auditPayload, ...(res.reason ? { reason: res.reason } : {}) },
      });
    } catch (e) {
      console.error("telegram audit insert", e);
    }
  }

  if (!res.ok) console.error(`telegram sendMessage failed [${res.status}]: ${res.reason}`);
  return res;
}

/** Record an inbound message on the same thread the outbound half uses. */
export async function recordInbound(
  admin: any,
  row: {
    userId: string;
    organizationId?: string | null;
    chatId: number | string;
    text?: string | null;
    updateId?: number | null;
    kind?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("telegram_messages").insert({
      user_id: row.userId,
      organization_id: row.organizationId ?? null,
      chat_id: row.chatId,
      direction: "in",
      text: row.text ?? null,
      update_id: row.updateId ?? null,
      kind: row.kind ?? "text",
      meta: row.meta ?? {},
    });
  } catch (e) {
    console.error("telegram_messages insert", e);
  }
}
