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
import { runSherlockSuggest } from "../_shared/sherlockSuggest.ts";
import { ROUTING_RULES, VOICE_RULES } from "../_shared/routingRules.ts";
import { enqueueBridgeUpdate } from "../_shared/outboundBridge.ts";
import { readPageFile, type PageReadResult } from "../_shared/pageRead.ts";


const ROUTE_LABEL: Record<string, string> = {
  memory: "a note for Memory",
  commitment: "a commitment",
  reminder: "a reminder",
  action: "an action draft",
  sherlock: "something worth a closer look",
  ignore: "noise to file away",
};

// Telegram shares the exact same voice constants as the in-app surfaces so
// wording stays identical across Companion (chat), Memory (capture), and
// Awareness (place answers). Telegram-specific layer: SMS-length brevity +
// reminder that messaging never executes — drafts land in-app for approval.
const TELEGRAM_CHANNEL = `Telegram channel rules: replies must be brief (1–3 sentences),
plain prose, no markdown. Messaging feeds the system — it does not control it.
Never claim to have executed anything risky; notes, actions, and commitments
surface as drafts inside the app for review. Sherlock, awareness briefings, and
schedule lookups are not available from Telegram — if the user asks for those,
acknowledge the request and tell them to open Vanta to see it.`;

const SYSTEM = `${COMPANION_VOICE}

${MEMORY_VOICE}

${AWARENESS_VOICE}

${TELEGRAM_CHANNEL}

You CAN create notes, reminders, commitments, and stage actions for approval.

${ROUTING_RULES}

${VOICE_RULES}`;

const tools = [
  { type: "function", function: { name: "capture_note", description: "Save a note.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["body"], additionalProperties: false } } },
  { type: "function", function: { name: "set_reminder", description: "Create a reminder. Use whenever the user asks you to remind them, nudge them, or follow up. Pass their exact time phrasing in `when` — server resolves against timezone + defaults.", parameters: { type: "object", properties: { summary: { type: "string" }, when: { type: "string" }, timezone: { type: "string" } }, required: ["summary", "when"], additionalProperties: false } } },
  { type: "function", function: { name: "stage_action", description: "Stage an action for review.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, risk: { type: "string", enum: ["low_reversible", "standard", "high"] } }, required: ["title"], additionalProperties: false } } },
  { type: "function", function: { name: "add_commitment", description: "Record a commitment.", parameters: { type: "object", properties: { summary: { type: "string" }, due_at: { type: "string" } }, required: ["summary"], additionalProperties: false } } },
];

type UserDefaults = { timezone: string; morning: string; afternoon: string; evening: string };

// Telegram → hub bridge. Anything captured from Telegram that actually routed
// somewhere is forwarded to LMT Camp State as an awareness notice: durable
// queue, signed body, retried by bridge-dispatch. Notification only — the hub
// is told what Vanta noticed, never what to do.
async function applyIntent(
  sb: SupabaseClient,
  userId: string,
  name: string,
  args: any,
  defaults: UserDefaults,
  orgId: string | null = null,
) {
  const res = await applyIntentCore(sb, userId, name, args, defaults, orgId);
  if (res?.routedTo) {
    const title = String(args?.title ?? args?.summary ?? res.detectedType ?? "Captured from Telegram");
    await enqueueBridgeUpdate(sb, {
      ownerId: userId,
      organizationId: orgId,
      eventType: `awareness.capture_routed.${res.routedTo}`,
      title: `Vanta captured ${res.detectedType ?? "an item"}: ${title}`,
      lines: [
        `Captured via: Telegram`,
        `Landed in: ${res.routedTo}`,
        "Nothing was executed — it is waiting for review in Vanta.",
      ],
      urgency: "normal",
      payload: {
        channel: "telegram",
        detected_type: res.detectedType ?? null,
        routed_to: res.routedTo,
        organization_id: orgId,
      },
      idempotencyKey: `tg:${userId}:${res.routedTo}:${await shortHash(`${title}|${res.detectedType}`)}`,
    });
  }
  return res;
}

async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function applyIntentCore(sb: SupabaseClient, userId: string, name: string, args: any, defaults: UserDefaults, orgId: string | null = null) {
  if (name === "capture_note") {
    const { data } = await sb.from("notes").insert({ user_id: userId, organization_id: orgId, title: args.title ?? null, body: args.body ?? "" }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "note", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "note", source_id: data.id, text: `${args.title ?? ""}\n${args.body ?? ""}` }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "memory", note_id: data?.id } });
    return { reply: VANTA_PHRASES.noteSaved(args.title), detectedType: "note", routedTo: "memory" };
  }
  if (name === "set_reminder") {
    const tz = args.timezone || defaults.timezone;
    const parsed = parseReminderHint(String(args.when ?? ""), { ...defaults, timezone: tz });
    if (parsed.status === "needs_time") {
      await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "reminder", event: "reminder.needs_time", payload: { source: "telegram", summary: args.summary, when: args.when } });
      return { reply: VANTA_PHRASES.reminderNeedsTime(), detectedType: "reminder", routedTo: null };
    }
    if (parsed.status === "needs_ampm") {
      await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "reminder", event: "reminder.needs_ampm", payload: { source: "telegram", summary: args.summary, when: args.when } });
      return { reply: VANTA_PHRASES.reminderAmPmAsk(parsed.hh, parsed.mm), detectedType: "reminder", routedTo: null };
    }
    if (parsed.status === "needs_tz") {
      return { reply: VANTA_PHRASES.reminderNeedsTz(), detectedType: "reminder", routedTo: null };
    }
    const { data } = await sb.from("commitments").insert({
      user_id: userId,
      organization_id: orgId,
      summary: args.summary,
      due_at: parsed.due_at,
      remind_at: parsed.remind_at,
      metadata: { kind: "reminder", source: "telegram", timezone: parsed.timezone, when_hint: args.when },
    }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "reminder", entity_id: data?.id, event: "reminder.scheduled", payload: { source: "telegram", summary: args.summary, due_at: parsed.due_at, timezone: parsed.timezone } });
    return { reply: VANTA_PHRASES.reminderCreated(parsed.phrasing), detectedType: "reminder", routedTo: "commitments" };
  }
  if (name === "stage_action") {
    const { data } = await sb.from("actions").insert({ user_id: userId, organization_id: orgId, title: args.title, description: args.description ?? null, risk: args.risk ?? "standard", status: "staged", source: "telegram" }).select("id").single();
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "actions", action_id: data?.id } });
    return { reply: VANTA_PHRASES.actionStaged(args.title), detectedType: "action draft", routedTo: "actions" };
  }
  if (name === "add_commitment") {
    const remind = args.due_at ? new Date(new Date(args.due_at).getTime() - 24 * 3600 * 1000).toISOString() : null;
    const { data } = await sb.from("commitments").insert({ user_id: userId, organization_id: orgId, summary: args.summary, due_at: args.due_at ?? null, remind_at: remind }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "commitments", commitment_id: data?.id } });
    return { reply: VANTA_PHRASES.commitmentRecorded(args.summary), detectedType: "commitment", routedTo: "commitments" };
  }
  return null;
}

async function aiRespond(sb: SupabaseClient, userId: string, text: string, orgId: string | null = null) {
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
      const res = await applyIntent(sb, userId, tc.function.name, args, defaults, orgId);
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
      organization_id: orgId,
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
  let userMsgId: string | null = null;
  if (conv?.id) {
    const { data: ins } = await sb.from("messages").insert([
      { user_id: userId, organization_id: orgId, conversation_id: conv.id, role: "user", content: text, metadata: userMeta },
      { user_id: userId, organization_id: orgId, conversation_id: conv.id, role: "assistant", content: reply, metadata: { source: "telegram", routed_to: routedTo } },
    ]).select("id, role");
    userMsgId = ((ins ?? []) as any[]).find((r) => r.role === "user")?.id ?? null;
  }

  // Phase 8 — when nothing routed automatically, ask Sherlock for a triage
  // suggestion and cache it against the captured message so the in-app
  // Capture Inbox surfaces the suggestion chip immediately. Doctrine:
  // messaging never executes; Sherlock only drafts a recommendation.
  if (!routedTo && userMsgId) {
    try {
      const finding = await runSherlockSuggest({
        admin: sb,
        userId,
        text,
        entity_type: "message",
        entity_id: userMsgId,
        source: "telegram",
        organizationId: orgId,
      });
      if (finding && finding.suggested_route !== "ignore") {
        const lane = ROUTE_LABEL[finding.suggested_route] ?? finding.suggested_route;
        reply = `${reply}\n\nLooks like ${lane}. Open Vanta to approve — nothing's been done yet.`.trim();
      }
    } catch { /* best-effort */ }
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
        .select("id, summary, metadata, status, due_at, remind_at, organization_id")
        .eq("id", commitmentId).eq("user_id", cbLink.user_id).maybeSingle();
      if (!comm) {
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not found." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const meta = (comm.metadata ?? {}) as Record<string, unknown>;
      const clearButtons = () => tg("editMessageReplyMarkup", {
        chat_id: cbChatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] },
      });
      const audit = (event: string, payload: Record<string, unknown>) => admin.from("audit_log").insert({
        user_id: cbLink.user_id,
        organization_id: comm.organization_id ?? null,
        entity_type: "commitment",
        entity_id: commitmentId,
        event,
        payload: { source: "telegram_callback", at: new Date().toISOString(), ...payload },
      });

      // Already resolved — say so instead of writing a second lifecycle change.
      if (comm.status !== "open" && (action === "done" || action === "snooze1h")) {
        await tg("answerCallbackQuery", {
          callback_query_id: cbId,
          text: comm.status === "done" ? "Already closed." : "This one was dropped.",
        });
        await clearButtons();
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (action === "done") {
        const nowIso = new Date().toISOString();
        const { error: doneErr } = await admin.from("commitments").update({
          status: "done",
          metadata: { ...meta, completed_at: nowIso, completed_via: "telegram" },
        }).eq("id", commitmentId).eq("user_id", cbLink.user_id);
        if (doneErr) {
          console.error("[vanta] telegram done failed:", doneErr.message);
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Couldn't save that. Open Vanta." });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
        await audit("commitment.completed", { from: "open", to: "done", completed_at: nowIso });
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Marked done." });
        await clearButtons();
        await tg("sendMessage", { chat_id: cbChatId, text: `Done — "${comm.summary}" closed.`, disable_web_page_preview: true });
      } else if (action === "snooze1h") {
        const nextRemind = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        // Parity with the in-app snooze: an already-overdue due date moves too,
        // otherwise the promise stays overdue while the reminder walks away.
        const shiftDue = !!(comm.due_at && new Date(comm.due_at).getTime() < Date.now());
        const { error: snoozeErr } = await admin.from("commitments").update({
          remind_at: nextRemind,
          ...(shiftDue ? { due_at: nextRemind } : {}),
          last_reminded_at: null,
          metadata: { ...meta, telegram_sent_at: null },
        }).eq("id", commitmentId).eq("user_id", cbLink.user_id);
        if (snoozeErr) {
          console.error("[vanta] telegram snooze failed:", snoozeErr.message);
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Couldn't save that. Open Vanta." });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
        await audit("reminder.snoozed", {
          minutes: 60,
          from: comm.remind_at ?? comm.due_at,
          to: nextRemind,
          due_shifted: shiftDue,
          preset: "+1 hour",
        });
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Snoozed 1h." });
        await clearButtons();
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
      // Also register the per-user channel link so Connected Accounts can
      // surface this pairing and the user can set a default route. Defaults
      // to 'personal' — they explicitly opt into workspace routing later.
      await admin.from("user_channel_links").upsert(
        {
          user_id: row.user_id,
          channel: "telegram",
          external_channel_id: String(chatId),
          provider_user_id: msg.from?.id ? String(msg.from.id) : null,
          status: "active",
          default_route: "personal",
          last_seen_at: new Date().toISOString(),
          metadata: { username: msg.from?.username ?? null },
        },
        { onConflict: "user_id,channel,external_channel_id" },
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

    /* A photo — or an image sent as a file — is a page. Vanta reads it and
       files it for review. It is capture, so it never routes or executes. */
    const photoSizes = Array.isArray(msg.photo) ? msg.photo : [];
    const biggest = photoSizes.length > 0 ? photoSizes[photoSizes.length - 1] : null;
    const imageDoc = msg.document && String(msg.document.mime_type ?? "").startsWith("image/")
      ? msg.document
      : null;
    const page: { fileId: string; mime: string; name: string } | null = biggest
      ? { fileId: biggest.file_id, mime: "image/jpeg", name: `page-${update.update_id}.jpg` }
      : imageDoc
        ? {
            fileId: imageDoc.file_id,
            mime: String(imageDoc.mime_type ?? "image/jpeg"),
            name: String(imageDoc.file_name ?? `page-${update.update_id}.jpg`),
          }
        : null;

    if (!text && !page) {
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
      await admin.from("user_channel_links")
        .update({ status: "disconnected" })
        .eq("user_id", link.user_id).eq("channel", "telegram").eq("external_channel_id", String(chatId));
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

    // Touch last_seen on the per-user channel link and resolve the default
    // route — captures from this chat get tagged with the right org_id (or
    // null for personal). RLS still enforces membership downstream.
    const { data: channelLink } = await admin.from("user_channel_links")
      .select("default_route")
      .eq("user_id", link.user_id).eq("channel", "telegram").eq("external_channel_id", String(chatId))
      .maybeSingle();
    admin.from("user_channel_links")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", link.user_id).eq("channel", "telegram").eq("external_channel_id", String(chatId))
      .then(() => {}, () => {});

    // Resolve workspace_id from default_route ('personal' | 'ask_each_time' | 'workspace:<uuid>').
    // Workspace routing requires an active membership — fall back to personal silently otherwise.
    let routeOrgId: string | null = null;
    const route = channelLink?.default_route ?? "personal";
    if (typeof route === "string" && route.startsWith("workspace:")) {
      const orgId = route.slice("workspace:".length);
      const { data: mem } = await admin.from("organization_members")
        .select("role").eq("organization_id", orgId).eq("user_id", link.user_id).eq("status", "active")
        .maybeSingle();
      if (mem) routeOrgId = orgId;
    }

    // Audit inbound (tagged with the workspace it was routed to, if any).
    await admin.from("audit_log").insert({
      user_id: link.user_id, entity_type: "telegram", event: "telegram.message_in",
      organization_id: routeOrgId,
      payload: { chat_id: chatId, text, route, has_page: !!page },
    });

    /* ---- Page capture: a photo of paper becomes readable text -------------
       Telegram retries a delivery it thinks failed, so the update id is the
       idempotency key: one message, one page, never two. The read is
       attempted straight away; if it does not land, the daily sweep picks the
       page up later and the file says so in the meantime. */
    if (page) {
      const { data: seen } = await admin.from("ingested_files")
        .select("id, note_id")
        .eq("user_id", link.user_id)
        .eq("metadata->>telegram_update_id", String(update.update_id))
        .maybeSingle();
      if (seen) {
        await tg("sendMessage", { chat_id: chatId, text: "Already got that page — it's in your Inbox." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      const fileRes = await tg("getFile", { file_id: page.fileId });
      const fileJson = await fileRes.json().catch(() => ({} as any));
      const filePath = fileJson?.result?.file_path;
      if (!filePath) {
        await admin.from("audit_log").insert({
          user_id: link.user_id, organization_id: routeOrgId,
          entity_type: "capture", event: "capture.failed",
          payload: { source: "telegram", reason: "telegram_getfile_failed" },
        });
        await tg("sendMessage", { chat_id: chatId, text: "Telegram wouldn't hand me that file. Try sending it again." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      const dl = await fetch(`${GATEWAY}/file/${filePath}`, {
        headers: {
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
          "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
        },
      });
      if (!dl.ok) {
        await admin.from("audit_log").insert({
          user_id: link.user_id, organization_id: routeOrgId,
          entity_type: "capture", event: "capture.failed",
          payload: { source: "telegram", reason: `download_${dl.status}` },
        });
        await tg("sendMessage", { chat_id: chatId, text: "The download failed on my side. Send it again in a moment." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const storagePath = `${link.user_id}/telegram/${Date.now()}-${page.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await admin.storage.from("memory-uploads")
        .upload(storagePath, bytes, { contentType: page.mime, upsert: false });
      if (upErr) {
        await admin.from("audit_log").insert({
          user_id: link.user_id, organization_id: routeOrgId,
          entity_type: "capture", event: "capture.failed",
          payload: { source: "telegram", reason: `storage_${upErr.message}`.slice(0, 200) },
        });
        await tg("sendMessage", { chat_id: chatId, text: "I couldn't store that page. Try again." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      const caption = String(msg.caption ?? "").trim();
      const { data: fileRec, error: fileErr } = await admin.from("ingested_files").insert({
        user_id: link.user_id,
        organization_id: routeOrgId,
        filename: page.name,
        mime_type: page.mime,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
        source: "telegram",
        status: "pending",
        review_status: "new",
        metadata: {
          page_photo: true,
          telegram_update_id: String(update.update_id),
          chat_id: chatId,
          caption: caption || null,
        },
      }).select("id, user_id, organization_id, filename, mime_type, storage_path, source, metadata").single();
      if (fileErr || !fileRec) {
        console.error("[vanta] telegram page insert failed:", fileErr?.message);
        await tg("sendMessage", { chat_id: chatId, text: "The page landed but I couldn't file it. Open Vanta and check the Inbox." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      await admin.from("audit_log").insert({
        user_id: link.user_id, organization_id: routeOrgId,
        entity_type: "capture", event: "capture.routed",
        payload: { source: "telegram", destination: "files", ingested_file_id: fileRec.id, kind: "page" },
      });

      let read: PageReadResult;
      try {
        read = await readPageFile(admin, fileRec as any);
      } catch {
        read = { ok: false, reason: "reading is paused" };
      }

      const reply = read.ok
        ? read.chars > 0
          ? `Read that page — ${read.chars.toLocaleString()} characters. It's in your Inbox as a draft, waiting on you.`
          : "Filed that page. Nothing readable came off it, so I didn't guess."
        : "Stored that page. I couldn't read it just now — the daily sweep will try again, and it's already in your Inbox.";
      await tg("sendMessage", { chat_id: chatId, text: reply });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    /* --------------------------------------------------------------------- */



    let reply = VANTA_PHRASES.gotIt();
    try {
      reply = await aiRespond(admin, link.user_id, text, routeOrgId);
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
