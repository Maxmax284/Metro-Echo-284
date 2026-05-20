// telegram-webhook: receive Telegram updates, route to Vanta intent pipeline.
// - Verifies X-Telegram-Bot-Api-Secret-Token (derived from TELEGRAM_API_KEY).
// - Pairing: /start <CODE> links a chat to a Vanta user account.
// - Conversation: text messages from a linked chat are routed to AI with the
//   same tools as vanta-converse (capture_note / stage_action / add_commitment),
//   then the assistant reply is sent back to Telegram.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function deriveSecret(key: string) {
  const data = new TextEncoder().encode(`telegram-webhook:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function safeEqual(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function tg(method: string, body: unknown) {
  return await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

import { COMPANION_VOICE, MEMORY_VOICE, AWARENESS_VOICE, VANTA_PHRASES } from "../_shared/vantaVoice.ts";
import { parseReminderHint } from "../_shared/reminderParse.ts";
import { linkEntities } from "../_shared/entityGraph.ts";

// Telegram shares the exact same voice constants as the in-app surfaces so
// wording stays identical across Companion (chat), Memory (capture), and
// Awareness (place answers). The only Telegram-specific layer is a thin
// channel modifier: warmer tone (per user pref) and SMS-length brevity.
const TELEGRAM_CHANNEL = `Telegram channel rules: warm and approachable, but still grounded.
Replies must be brief (1–3 sentences), plain prose, no markdown. Occasional emoji
is fine on a success acknowledgement (⏰ for reminders, 📝 for notes) — never on
errors, warnings, or anything serious. Vary your phrasing. Messaging feeds the
system — it does not control it. Never claim to have executed anything risky;
notes, actions, and commitments surface as drafts inside the app for review.`;

const SYSTEM = `${COMPANION_VOICE}

${MEMORY_VOICE}

${AWARENESS_VOICE}

${TELEGRAM_CHANNEL}

You CAN create notes, reminders, commitments, and stage actions for approval.
NEVER tell the user "I can't directly set reminders" or "I'm unable to add
notes" — route them. If a detail is missing (like the time for a reminder),
ask ONE short question. No generic chatbot filler: no "As an AI…", no "Great
news!", no "Absolutely, I'd be happy to assist!".

Tool routing:
- "Remind me…" / "Nudge me…" / "Follow up…" → set_reminder.
- "Note that…" / "Save this…" / "Remember…" → capture_note.
- "I promised…" / "I committed to…" → add_commitment.
- External action to draft → stage_action.
Otherwise answer succinctly.`;

const tools = [
  { type: "function", function: { name: "capture_note", description: "Save a note.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["body"], additionalProperties: false } } },
  { type: "function", function: { name: "set_reminder", description: "Create a reminder. Use whenever the user asks you to remind them, nudge them, or follow up. Pass their exact time phrasing in `when` — server resolves against timezone + defaults.", parameters: { type: "object", properties: { summary: { type: "string" }, when: { type: "string" }, timezone: { type: "string" } }, required: ["summary", "when"], additionalProperties: false } } },
  { type: "function", function: { name: "stage_action", description: "Stage an action for review.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, risk: { type: "string", enum: ["low_reversible", "standard", "high"] } }, required: ["title"], additionalProperties: false } } },
  { type: "function", function: { name: "add_commitment", description: "Record a commitment.", parameters: { type: "object", properties: { summary: { type: "string" }, due_at: { type: "string" } }, required: ["summary"], additionalProperties: false } } },
];

type UserDefaults = { timezone: string; morning: string; afternoon: string; evening: string };

async function applyIntent(sb: SupabaseClient, userId: string, name: string, args: any, defaults: UserDefaults) {
  if (name === "capture_note") {
    const { data } = await sb.from("notes").insert({ user_id: userId, title: args.title ?? null, body: args.body ?? "" }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "note", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "note", source_id: data.id, text: `${args.title ?? ""}\n${args.body ?? ""}` }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "memory", note_id: data?.id } });
    return { reply: VANTA_PHRASES.noteSaved(args.title), detectedType: "note", routedTo: "memory" };
  }
  if (name === "set_reminder") {
    const tz = args.timezone || defaults.timezone;
    const parsed = parseReminderHint(String(args.when ?? ""), { ...defaults, timezone: tz });
    if (parsed.status === "needs_time") {
      await sb.from("audit_log").insert({ user_id: userId, entity_type: "reminder", event: "reminder.needs_time", payload: { source: "telegram", summary: args.summary, when: args.when } });
      return { reply: VANTA_PHRASES.reminderNeedsTime(), detectedType: "reminder", routedTo: null };
    }
    if (parsed.status === "needs_ampm") {
      await sb.from("audit_log").insert({ user_id: userId, entity_type: "reminder", event: "reminder.needs_ampm", payload: { source: "telegram", summary: args.summary, when: args.when } });
      return { reply: VANTA_PHRASES.reminderAmPmAsk(parsed.hh, parsed.mm), detectedType: "reminder", routedTo: null };
    }
    if (parsed.status === "needs_tz") {
      return { reply: VANTA_PHRASES.reminderNeedsTz(), detectedType: "reminder", routedTo: null };
    }
    const { data } = await sb.from("commitments").insert({
      user_id: userId,
      summary: args.summary,
      due_at: parsed.due_at,
      remind_at: parsed.remind_at,
      metadata: { kind: "reminder", source: "telegram", timezone: parsed.timezone, when_hint: args.when },
    }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, entity_type: "reminder", entity_id: data?.id, event: "reminder.scheduled", payload: { source: "telegram", summary: args.summary, due_at: parsed.due_at, timezone: parsed.timezone } });
    return { reply: VANTA_PHRASES.reminderCreated(parsed.phrasing), detectedType: "reminder", routedTo: "commitments" };
  }
  if (name === "stage_action") {
    const { data } = await sb.from("actions").insert({ user_id: userId, title: args.title, description: args.description ?? null, risk: args.risk ?? "standard", status: "staged", source: "telegram" }).select("id").single();
    await sb.from("audit_log").insert({ user_id: userId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "actions", action_id: data?.id } });
    return { reply: VANTA_PHRASES.actionStaged(args.title), detectedType: "action draft", routedTo: "actions" };
  }
  if (name === "add_commitment") {
    const remind = args.due_at ? new Date(new Date(args.due_at).getTime() - 24 * 3600 * 1000).toISOString() : null;
    const { data } = await sb.from("commitments").insert({ user_id: userId, summary: args.summary, due_at: args.due_at ?? null, remind_at: remind }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "commitments", commitment_id: data?.id } });
    return { reply: VANTA_PHRASES.commitmentRecorded(args.summary), detectedType: "commitment", routedTo: "commitments" };
  }
  return null;
}

async function aiRespond(sb: SupabaseClient, userId: string, text: string) {
  // pull a little context from the user's most recent conversation
  const { data: conv } = await sb.from("conversations").select("id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  let history: any[] = [];
  if (conv?.id) {
    const { data: m } = await sb.from("messages").select("role, content").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(20);
    history = (m ?? []).filter((x: any) => x.role === "user" || x.role === "assistant");
  }

  // Stage 3 — match Companion: pull active corrections + recent field notes so
  // Telegram replies respect the same lived context. Also pull tz + default
  // morning/afternoon/evening so reminder routing can resolve vague hints.
  const [{ data: corrections }, { data: fieldNotes }, { data: profile }] = await Promise.all([
    sb.from("corrections")
      .select("surface, target_type, feedback_type, user_note")
      .eq("user_id", userId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(8),
    sb.from("field_notes")
      .select("note_type, summary, location_label")
      .eq("user_id", userId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(8),
    sb.from("profiles").select("timezone, preferences").eq("id", userId).maybeSingle(),
  ]);
  const correctionsBlock = (corrections ?? []).length
    ? "Active user corrections (respect these; do not repeat the mistake):\n" +
      (corrections ?? []).map((c: any) =>
        `- [${c.surface}/${c.target_type}] ${c.feedback_type}${c.user_note ? `: ${c.user_note}` : ""}`
      ).join("\n")
    : "";
  const fieldNotesBlock = (fieldNotes ?? []).length
    ? "User field notes (lived context, treat as ground truth):\n" +
      (fieldNotes ?? []).map((n: any) =>
        `- [${n.note_type}]${n.location_label ? ` @ ${n.location_label}` : ""}: ${n.summary}`
      ).join("\n")
    : "";
  const prefs = (profile?.preferences ?? {}) as any;
  const defaults: UserDefaults = {
    timezone: profile?.timezone || "UTC",
    morning: prefs.default_morning_time ?? "08:00",
    afternoon: prefs.default_afternoon_time ?? "14:00",
    evening: prefs.default_evening_time ?? "19:00",
  };
  const timeBlock = `User time context:
- timezone: ${defaults.timezone}
- morning: ${defaults.morning}, afternoon: ${defaults.afternoon}, evening/tonight: ${defaults.evening}`;
  const sys = [SYSTEM, timeBlock, correctionsBlock, fieldNotesBlock].filter(Boolean).join("\n\n");

  const messages = [{ role: "system", content: sys }, ...history, { role: "user", content: text }];

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }),
  });
  if (!r.ok) throw new Error(`ai gateway ${r.status}`);
  const j = await r.json();
  const choice = j.choices?.[0]?.message;
  let reply = choice?.content?.trim() ?? "";
  const intents: string[] = [];
  let detectedType: string | null = null;
  let routedTo: string | null = null;
  for (const tc of choice?.tool_calls ?? []) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}");
      const res = await applyIntent(sb, userId, tc.function.name, args, defaults);
      if (res) {
        intents.push(res.reply);
        detectedType = res.detectedType;
        routedTo = res.routedTo;
      }
    } catch { /* ignore */ }
  }
  if (intents.length) reply = `${reply ? reply + "\n\n" : ""}${intents.join("\n")}`.trim();
  if (!reply) reply = VANTA_PHRASES.gotIt();

  // Stage 7 — audit expansion: when nothing routed, this is an ambiguous capture
  // waiting for review in the Captures lane. Emit a distinct event so the Audit
  // surface can show "front desk" activity, not just executed lifecycle.
  if (!routedTo) {
    await sb.from("audit_log").insert({
      user_id: userId,
      entity_type: "capture",
      event: "capture.needs_review",
      payload: { source: "telegram", text: text.slice(0, 200) },
    });
  }

  // persist into the user's most recent conversation for cross-surface continuity.
  // Stamp detected_type / routed_to / needs_review so the Capture Log + Captures lane
  // can render the front-desk chips uniformly across channels.
  const userMeta: Record<string, unknown> = { source: "telegram" };
  if (detectedType) userMeta.detected_type = detectedType;
  if (routedTo) {
    userMeta.routed_to = routedTo;
    userMeta.confidence = "high";
  } else {
    userMeta.needs_review = true;
    userMeta.confidence = "low";
  }
  if (conv?.id) {
    await sb.from("messages").insert([
      { user_id: userId, conversation_id: conv.id, role: "user", content: text, metadata: userMeta },
      { user_id: userId, conversation_id: conv.id, role: "assistant", content: reply, metadata: { source: "telegram", routed_to: routedTo } },
    ]);
  }
  return reply;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  try {
    const tgKey = Deno.env.get("TELEGRAM_API_KEY");
    if (!tgKey) return new Response("no key", { status: 500 });
    const expected = await deriveSecret(tgKey);
    if (!safeEqual(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), expected)) {
      return new Response("unauthorized", { status: 401 });
    }

    const update = await req.json();

    // Service role to operate across users (chat_id maps to a user).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Inline-button callbacks from reminder messages: Mark done / Snooze 1h.
    if (update.callback_query) {
      const cb = update.callback_query;
      const cbId = cb.id;
      const cbChatId = cb.message?.chat?.id;
      const data: string = cb.data ?? "";
      const [action, commitmentId] = data.split(":");
      if (!cbChatId || !commitmentId) {
        await tg("answerCallbackQuery", { callback_query_id: cbId });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const { data: cbLink } = await admin.from("telegram_chat_links").select("user_id").eq("chat_id", cbChatId).maybeSingle();
      if (!cbLink) {
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not linked." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      // Verify the commitment belongs to this user.
      const { data: comm } = await admin.from("commitments")
        .select("id, summary, metadata").eq("id", commitmentId).eq("user_id", cbLink.user_id).maybeSingle();
      if (!comm) {
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not found." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const meta = (comm.metadata ?? {}) as Record<string, unknown>;
      if (action === "done") {
        await admin.from("commitments").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", commitmentId);
        await admin.from("audit_log").insert({
          user_id: cbLink.user_id, entity_type: "commitment", entity_id: commitmentId,
          event: "commitment.completed", payload: { source: "telegram_callback" },
        });
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Marked done." });
        await tg("editMessageReplyMarkup", { chat_id: cbChatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
        await tg("sendMessage", { chat_id: cbChatId, text: `Done — "${comm.summary}" closed.`, disable_web_page_preview: true });
      } else if (action === "snooze1h") {
        const nextRemind = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await admin.from("commitments").update({
          remind_at: nextRemind,
          last_reminded_at: null,
          metadata: { ...meta, telegram_sent_at: null },
        }).eq("id", commitmentId);
        await admin.from("audit_log").insert({
          user_id: cbLink.user_id, entity_type: "commitment", entity_id: commitmentId,
          event: "reminder.snoozed", payload: { source: "telegram_callback", minutes: 60 },
        });
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Snoozed 1h." });
        await tg("editMessageReplyMarkup", { chat_id: cbChatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      } else {
        await tg("answerCallbackQuery", { callback_query_id: cbId });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    const msg = update.message ?? update.edited_message;
    const chatId = msg?.chat?.id;
    const text: string = (msg?.text ?? "").trim();
    if (!chatId) return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });


    // Pair with /start CODE
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const code = parts[1]?.toUpperCase();
      if (!code) {
        await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.welcome() });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const { data: row } = await admin.from("telegram_link_codes").select("*").eq("code", code).maybeSingle();
      if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.badCode() });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      // upsert link (chat_id unique)
      await admin.from("telegram_chat_links").upsert(
        { user_id: row.user_id, chat_id: chatId, tg_username: msg.from?.username ?? null },
        { onConflict: "chat_id" },
      );
      await admin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);
      await admin.from("audit_log").insert({ user_id: row.user_id, entity_type: "telegram", event: "telegram.linked", payload: { chat_id: chatId, username: msg.from?.username ?? null } });
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.linked() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Look up linked user
    const { data: link } = await admin.from("telegram_chat_links").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!link) {
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.notLinked() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (!text) {
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.textOnly() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // /help — voice-aligned help text
    if (text === "/help" || text.startsWith("/help ")) {
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.help() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // /unlink — remove the chat→user link
    if (text === "/unlink" || text.startsWith("/unlink ")) {
      await admin.from("telegram_chat_links").delete().eq("chat_id", chatId);
      await admin.from("audit_log").insert({ user_id: link.user_id, entity_type: "telegram", event: "telegram.unlinked", payload: { chat_id: chatId } });
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.unlinked() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Rate limit per linked user — same bucket pattern as vanta-converse
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: link.user_id, _bucket: "telegram-webhook", _limit: 30, _window_seconds: 60,
    });
    if (allowed === false) {
      await tg("sendMessage", { chat_id: chatId, text: VANTA_PHRASES.telegram.rateLimited() });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Audit inbound
    await admin.from("audit_log").insert({ user_id: link.user_id, entity_type: "telegram", event: "telegram.message_in", payload: { chat_id: chatId, text } });

    let reply = VANTA_PHRASES.gotIt();
    try {
      reply = await aiRespond(admin, link.user_id, text);
    } catch (e) {
      reply = VANTA_PHRASES.telegram.snag();
      console.error("aiRespond error", e);
    }
    await tg("sendMessage", { chat_id: chatId, text: reply });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("telegram-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
