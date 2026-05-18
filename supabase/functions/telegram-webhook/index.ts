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

import { TELEGRAM_VOICE, VANTA_PHRASES } from "../_shared/vantaVoice.ts";

const SYSTEM = `${TELEGRAM_VOICE}
Replies must be brief (1–4 sentences), plain prose, no emoji.
When the user clearly wants to capture a note, stage an action, or record a commitment, call the matching tool. Otherwise, answer succinctly.`;

const tools = [
  { type: "function", function: { name: "capture_note", description: "Save a note.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["body"], additionalProperties: false } } },
  { type: "function", function: { name: "stage_action", description: "Stage an action for review.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, risk: { type: "string", enum: ["low_reversible", "standard", "high"] } }, required: ["title"], additionalProperties: false } } },
  { type: "function", function: { name: "add_commitment", description: "Record a commitment.", parameters: { type: "object", properties: { summary: { type: "string" }, due_at: { type: "string" } }, required: ["summary"], additionalProperties: false } } },
];

async function applyIntent(sb: SupabaseClient, userId: string, name: string, args: any) {
  if (name === "capture_note") {
    const { data } = await sb.from("notes").insert({ user_id: userId, title: args.title ?? null, body: args.body ?? "" }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "note", id: data.id } }).catch(() => {});
    return VANTA_PHRASES.noteSaved(args.title);
  }
  if (name === "stage_action") {
    await sb.from("actions").insert({ user_id: userId, title: args.title, description: args.description ?? null, risk: args.risk ?? "standard", status: "staged", source: "telegram" });
    return VANTA_PHRASES.actionStaged(args.title);
  }
  if (name === "add_commitment") {
    const remind = args.due_at ? new Date(new Date(args.due_at).getTime() - 24 * 3600 * 1000).toISOString() : null;
    const { data } = await sb.from("commitments").insert({ user_id: userId, summary: args.summary, due_at: args.due_at ?? null, remind_at: remind }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    return VANTA_PHRASES.commitmentRecorded(args.summary);
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
  const messages = [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: text }];

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
  for (const tc of choice?.tool_calls ?? []) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}");
      const note = await applyIntent(sb, userId, tc.function.name, args);
      if (note) intents.push(note);
    } catch { /* ignore */ }
  }
  if (intents.length) reply = `${reply ? reply + "\n\n" : ""}${intents.join("\n")}`.trim();
  if (!reply) reply = VANTA_PHRASES.gotIt();

  // persist into the user's most recent conversation for cross-surface continuity
  if (conv?.id) {
    await sb.from("messages").insert([
      { user_id: userId, conversation_id: conv.id, role: "user", content: text, metadata: { source: "telegram" } },
      { user_id: userId, conversation_id: conv.id, role: "assistant", content: reply, metadata: { source: "telegram" } },
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
    const msg = update.message ?? update.edited_message;
    const chatId = msg?.chat?.id;
    const text: string = (msg?.text ?? "").trim();
    if (!chatId) return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });

    // Service role to operate across users (chat_id maps to a user).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pair with /start CODE
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const code = parts[1]?.toUpperCase();
      if (!code) {
        await tg("sendMessage", { chat_id: chatId, text: "Hi — I'm Vanta. To link this chat, generate a pairing code in the app and send: /start YOURCODE" });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      const { data: row } = await admin.from("telegram_link_codes").select("*").eq("code", code).maybeSingle();
      if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        await tg("sendMessage", { chat_id: chatId, text: "That code is invalid or expired. Generate a new one in the app." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      // upsert link (chat_id unique)
      await admin.from("telegram_chat_links").upsert(
        { user_id: row.user_id, chat_id: chatId, tg_username: msg.from?.username ?? null },
        { onConflict: "chat_id" },
      );
      await admin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);
      await admin.from("audit_log").insert({ user_id: row.user_id, entity_type: "telegram", event: "telegram.linked", payload: { chat_id: chatId, username: msg.from?.username ?? null } });
      await tg("sendMessage", { chat_id: chatId, text: "Linked. Send me anything — notes, commitments, or actions to stage." });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Look up linked user
    const { data: link } = await admin.from("telegram_chat_links").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!link) {
      await tg("sendMessage", { chat_id: chatId, text: "This chat isn't linked yet. Generate a pairing code in the app, then send: /start YOURCODE" });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (!text) {
      await tg("sendMessage", { chat_id: chatId, text: "I can only handle text right now." });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Audit inbound
    await admin.from("audit_log").insert({ user_id: link.user_id, entity_type: "telegram", event: "telegram.message_in", payload: { chat_id: chatId, text } });

    let reply = "Got it.";
    try {
      reply = await aiRespond(admin, link.user_id, text);
    } catch (e) {
      reply = "I hit a snag processing that. Try again in a moment.";
      console.error("aiRespond error", e);
    }
    await tg("sendMessage", { chat_id: chatId, text: reply });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("telegram-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
