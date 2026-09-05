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


/** Thread record. Every message in or out is kept so the Telegram room inside
 *  Vanta shows the real conversation, not a webhook log. Never blocks a reply. */
async function logTgMessage(admin: any, row: Record<string, unknown>) {
  try { await admin.from("telegram_messages").insert(row); } catch (e) { console.error("telegram_messages insert", e); }
}

import {
  COMPANION_VOICE,
  MEMORY_VOICE,
  AWARENESS_VOICE,
  VANTA_PHRASES,
  matchIdentityQuestion,
  IDENTITY_ANSWERS,
} from "../_shared/vantaVoice.ts";
import { brandVoiceDirective, readBrandVoice, type VoiceContext } from "../_shared/brandVoice.ts";
import { depthDirective } from "../_shared/responseDepth.ts";
import { detectSensitive } from "../_shared/sensitive.ts";
import { parseReminderHint } from "../_shared/reminderParse.ts";
import { linkEntities } from "../_shared/entityGraph.ts";
import { runSherlockSuggest } from "../_shared/sherlockSuggest.ts";
import { ROUTING_RULES, VOICE_RULES } from "../_shared/routingRules.ts";
import { enqueueBridgeUpdate } from "../_shared/outboundBridge.ts";
import { readPageFile, type PageReadResult } from "../_shared/pageRead.ts";
import { intentFromCaption, lookAtImage } from "../_shared/lookAt.ts";
import { fitToBody } from "../_shared/responseDepth.ts";
import {
  fileUnderButton,
  keyboard,
  markDoneButton,
  openButton,
  snoozeMinutesFor,
  SNOOZE_PRESETS,
  type TgReplyMarkup,
  type VantaLinkKind,
} from "../_shared/telegramReplies.ts";
import {
  attachToProject,
  findProject,
  listProjects,
  projectStatus,
  whatsChanged,
  whatsDue,
  whatsWaiting,
} from "../_shared/workReads.ts";



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
// Awareness (place answers). How MUCH gets said is not decided here — it comes
// from the shared response-depth model, so Telegram can never drift into its own
// private compression rules.
const TELEGRAM_CHANNEL = `Telegram channel law:
Messaging feeds the system — it does not control it. Never claim to have executed anything risky;
notes, actions, and commitments surface as drafts inside the app for review.
You CAN answer read-only questions about the user's desks by calling the read
tools (whats_waiting, whats_due, project_status, whats_changed). Use them instead
of guessing from chat history — never invent counts or names. You can also file an
existing capture under a project. You cannot approve, execute, export, send, book,
or pay anything; for those, say it's waiting inside Vanta — flatly, not apologetically.
Never write a tidy assistant paragraph.`;


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
  // Read-only Work questions. These never write anything.
  { type: "function", function: { name: "whats_waiting", description: "Read-only: what is waiting on the user right now (drafts awaiting approval, overdue promises, Inbox items needing a lane). Use for 'what's waiting', 'what do I owe', 'anything on me'.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "whats_due", description: "Read-only: promises due soon or overdue. Use for 'what's due', 'what's slipping', 'this week'.", parameters: { type: "object", properties: { days: { type: "number" } }, additionalProperties: false } } },
  { type: "function", function: { name: "project_status", description: "Read-only: status of one project by name. Use for 'how's <project> going'.", parameters: { type: "object", properties: { project: { type: "string" } }, required: ["project"], additionalProperties: false } } },
  { type: "function", function: { name: "whats_changed", description: "Read-only: what moved recently across captures, promises, drafts and flagged items.", parameters: { type: "object", properties: { days: { type: "number" } }, additionalProperties: false } } },
  { type: "function", function: { name: "file_under_project", description: "File the most recent capture (or a named one) under an existing project. Reversible filing link only — it does not execute anything.", parameters: { type: "object", properties: { project: { type: "string" } }, required: ["project"], additionalProperties: false } } },
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
    return { reply: VANTA_PHRASES.noteSaved(args.title), detectedType: "note", routedTo: "memory", linkKind: "inbox" as VantaLinkKind, itemType: "note", itemId: data?.id ?? null };
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
    return { reply: VANTA_PHRASES.reminderCreated(parsed.phrasing), detectedType: "reminder", routedTo: "commitments", linkKind: "commitments" as VantaLinkKind, commitmentId: data?.id ?? null };
  }
  if (name === "stage_action") {
    const { data } = await sb.from("actions").insert({ user_id: userId, organization_id: orgId, title: args.title, description: args.description ?? null, risk: args.risk ?? "standard", status: "staged", source: "telegram" }).select("id").single();
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "actions", action_id: data?.id } });
    return { reply: VANTA_PHRASES.actionStaged(args.title), detectedType: "action draft", routedTo: "actions", linkKind: "actions" as VantaLinkKind };
  }
  if (name === "add_commitment") {
    const remind = args.due_at ? new Date(new Date(args.due_at).getTime() - 24 * 3600 * 1000).toISOString() : null;
    const { data } = await sb.from("commitments").insert({ user_id: userId, organization_id: orgId, summary: args.summary, due_at: args.due_at ?? null, remind_at: remind }).select("id").single();
    if (data) sb.functions.invoke("embeddings-generate", { body: { mode: "single", kind: "commitment", id: data.id } }).catch(() => {});
    if (data?.id) linkEntities({ sb, userId, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" }).catch(() => {});
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "commitments", commitment_id: data?.id } });
    return { reply: VANTA_PHRASES.commitmentRecorded(args.summary), detectedType: "commitment", routedTo: "commitments", linkKind: "commitments" as VantaLinkKind, commitmentId: data?.id ?? null };
  }

  /* ---- Read-only Work questions. Same helpers the app uses, scoped the same
     way. Nothing here writes anything, so nothing is audited as a capture. -- */
  const scope = { userId, orgId };
  if (name === "whats_waiting") {
    const { text } = await whatsWaiting(sb, scope);
    return { reply: text, detectedType: null, routedTo: null, readOnly: true, linkKind: "work" as VantaLinkKind };
  }
  if (name === "whats_due") {
    const { text } = await whatsDue(sb, scope, { days: Number(args?.days) || 7, tz: defaults.timezone });
    return { reply: text, detectedType: null, routedTo: null, readOnly: true, linkKind: "commitments" as VantaLinkKind };
  }
  if (name === "whats_changed") {
    const { text } = await whatsChanged(sb, scope, { days: Number(args?.days) || 7 });
    return { reply: text, detectedType: null, routedTo: null, readOnly: true, linkKind: "today" as VantaLinkKind };
  }
  if (name === "project_status") {
    const { text } = await projectStatus(sb, scope, String(args?.project ?? ""));
    return { reply: text, detectedType: null, routedTo: null, readOnly: true, linkKind: "projects" as VantaLinkKind };
  }

  /* ---- Filing: a reversible link between a capture and a project. --------- */
  if (name === "file_under_project") {
    const project = await findProject(sb, scope, String(args?.project ?? ""));
    if (!project) {
      const options = await listProjects(sb, scope, 5);
      const list = options.length ? ` I can see: ${options.map((o) => o.title).join(", ")}.` : "";
      return { reply: `No project matching that.${list}`, detectedType: null, routedTo: null, readOnly: true };
    }
    const { data: recent } = await (orgId
      ? sb.from("ingested_files").select("id").eq("user_id", userId).eq("organization_id", orgId)
      : sb.from("ingested_files").select("id").eq("user_id", userId).is("organization_id", null))
      .eq("source", "telegram").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!recent?.id) {
      return { reply: "Nothing recent from this chat to file. Send it first, then tell me where it goes.", detectedType: null, routedTo: null, readOnly: true };
    }
    const res = await attachToProject(sb, scope, { projectId: project.id, itemType: "file", itemId: recent.id, via: "Telegram" });
    return res.ok
      ? { reply: `Filed under ${res.title}. Nothing else happened to it.`, detectedType: null, routedTo: null, readOnly: true, linkKind: "projects" as VantaLinkKind }
      : { reply: "Couldn't file that. Open Vanta and attach it there.", detectedType: null, routedTo: null, readOnly: true };
  }

  return null;
}

async function aiRespond(sb: SupabaseClient, userId: string, text: string, orgId: string | null = null) {
  // Identity questions never reach a model. Fixed copy, one line, done — so no
  // provider or model name can ever be presented as Vanta's identity or author.
  const idq = matchIdentityQuestion(text);
  if (idq) {
    return {
      reply: IDENTITY_ANSWERS[idq],
      detectedType: null as string | null,
      routedTo: null as string | null,
      readOnly: true,
      linkKind: null as VantaLinkKind | null,
      commitmentId: null as string | null,
    };
  }

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

  // Telegram now wears the same brand-voice layer as in-app chat, and the accent
  // steps down automatically when the message is serious: legal, financial,
  // medical, identity or safety content forces the calmest, most precise level.
  const bv = readBrandVoice(prefs as Record<string, unknown>);
  const sensitive = detectSensitive(text).sensitive;
  const ctx: VoiceContext = sensitive
    ? "sensitive"
    : /\b(what'?s|whats|how'?s|hows|any|status|due|waiting|changed|going)\b/i.test(text)
      ? "answer"
      : "routine";
  const brandBlock = brandVoiceDirective(bv, ctx);

  const sys = [SYSTEM, brandBlock, depthDirective("telegram"), timeBlock, correctionsBlock, fieldNotesBlock]
    .filter(Boolean).join("\n\n");

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
  let readOnly = false;
  let linkKind: VantaLinkKind | null = null;
  let commitmentId: string | null = null;
  for (const tc of choice?.tool_calls ?? []) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}");
      const res = await applyIntent(sb, userId, tc.function.name, args, defaults, orgId);
      if (res) {
        intents.push(res.reply);
        detectedType = res.detectedType ?? detectedType;
        routedTo = res.routedTo ?? routedTo;
        if ((res as any).readOnly) readOnly = true;
        linkKind = ((res as any).linkKind as VantaLinkKind | undefined) ?? linkKind;
        commitmentId = ((res as any).commitmentId as string | undefined) ?? commitmentId;
      }
    } catch { /* ignore */ }
  }
  if (intents.length) reply = `${reply ? reply + "\n\n" : ""}${intents.join("\n")}`.trim();
  if (!reply) reply = VANTA_PHRASES.gotIt();

  // Stage 7 — audit expansion: when nothing routed, this is an ambiguous capture
  // waiting for review in the Captures lane. Emit a distinct event so the Audit
  // surface can show "front desk" activity, not just executed lifecycle.
  if (!routedTo && !readOnly) {
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
  if (!routedTo && !readOnly && userMsgId) {
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

  // One deep link, at most one action button. Fixed vocabulary only.
  const markup = commitmentId
    ? keyboard([markDoneButton(commitmentId)], [openButton("commitments", { commitmentId })])
    : keyboard([openButton(linkKind ?? "today")]);
  return { reply, markup };
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
      const parts = data.split(":");
      const action = parts[0];
      const commitmentId = parts[1];
      const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      if (!cbChatId || !commitmentId) {
        await tg("answerCallbackQuery", { callback_query_id: cbId });
        return ok();
      }
      const { data: cbLink } = await admin.from("telegram_chat_links").select("user_id").eq("chat_id", cbChatId).maybeSingle();
      if (!cbLink) {
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not linked." });
        return ok();
      }
      const dropButtons = () => tg("editMessageReplyMarkup", {
        chat_id: cbChatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] },
      });

      // "Noted" — acknowledges a nudge. Marks it seen; changes nothing else.
      if (action === "noted") {
        const { data: nudge } = await admin.from("nudges")
          .select("id, status, organization_id").eq("id", commitmentId).eq("user_id", cbLink.user_id).maybeSingle();
        if (nudge && nudge.status === "pending") {
          await admin.from("nudges").update({ status: "seen", seen_at: new Date().toISOString() }).eq("id", nudge.id);
          await admin.from("audit_log").insert({
            user_id: cbLink.user_id, organization_id: nudge.organization_id ?? null,
            entity_type: "nudge", entity_id: nudge.id, event: "nudge.seen",
            payload: { source: "telegram_callback", at: new Date().toISOString() },
          });
        }
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: nudge ? "Noted." : "Not found." });
        await dropButtons();
        return ok();
      }

      // "File under <project>" — a reversible filing link, nothing more.
      if (action === "file") {
        const [, projectId, itemType, itemId] = parts;
        if (!projectId || !itemType || !itemId) {
          await tg("answerCallbackQuery", { callback_query_id: cbId });
          return ok();
        }
        const { data: prof } = await admin.from("projects").select("organization_id").eq("id", projectId).maybeSingle();
        const res = await attachToProject(
          admin,
          { userId: cbLink.user_id, orgId: (prof as any)?.organization_id ?? null },
          { projectId, itemType, itemId, via: "Telegram" },
        );
        await tg("answerCallbackQuery", {
          callback_query_id: cbId,
          text: res.ok ? `Filed under ${res.title}.` : "Couldn't file that. Open Vanta.",
        });
        if (res.ok) await dropButtons();
        return ok();
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
      const snoozeMinutes = snoozeMinutesFor(action);
      if (comm.status !== "open" && (action === "done" || snoozeMinutes !== null)) {
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
      } else if (snoozeMinutes !== null) {
        const nextRemind = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
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
        const presetLabel = SNOOZE_PRESETS.find((p) => p.key === action)?.label ?? `+${snoozeMinutes}m`;
        await audit("reminder.snoozed", {
          minutes: snoozeMinutes,
          from: comm.remind_at ?? comm.due_at,
          to: nextRemind,
          due_shifted: shiftDue,
          preset: presetLabel,
        });
        await tg("answerCallbackQuery", { callback_query_id: cbId, text: `${presetLabel}.` });
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

    /* A photo — an image sent as a file — or a document (PDF, Word, plain
       text) is a page. Vanta reads it and files it for review. It is capture,
       so it never routes or executes. One pipeline, many doors. */
    const photoSizes = Array.isArray(msg.photo) ? msg.photo : [];
    const biggest = photoSizes.length > 0 ? photoSizes[photoSizes.length - 1] : null;
    const docMime = String(msg.document?.mime_type ?? "").toLowerCase();
    const docName = String(msg.document?.file_name ?? "");
    const docExt = docName.split(".").pop()?.toLowerCase() ?? "";
    const isDocMime =
      docMime === "application/pdf" ||
      docMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      docMime.startsWith("text/") ||
      ["pdf", "docx", "txt", "md"].includes(docExt);
    const imageDoc = msg.document && docMime.startsWith("image/")
      ? msg.document
      : null;
    const paperDoc = msg.document && !imageDoc && isDocMime ? msg.document : null;
    const page: { fileId: string; mime: string; name: string; isDoc?: boolean } | null = biggest
      ? { fileId: biggest.file_id, mime: "image/jpeg", name: `page-${update.update_id}.jpg` }
      : imageDoc
        ? {
            fileId: imageDoc.file_id,
            mime: String(imageDoc.mime_type ?? "image/jpeg"),
            name: String(imageDoc.file_name ?? `page-${update.update_id}.jpg`),
          }
        : paperDoc
          ? {
              fileId: paperDoc.file_id,
              mime: String(paperDoc.mime_type ?? "application/octet-stream"),
              name: String(paperDoc.file_name ?? `document-${update.update_id}`),
              isDoc: true,
            }
          : null;

    /* A file Vanta can't take gets a plain answer, not silence. */
    if (!text && !page && msg.document) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "I can't read that type yet. Photos, PDFs and Word documents work — and a plain message always does.",
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

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
    await logTgMessage(admin, {
      user_id: link.user_id, organization_id: routeOrgId, chat_id: chatId,
      direction: "in", text: text || null, update_id: update.update_id ?? null,
      kind: page ? "page" : "text", meta: { route, username: msg.from?.username ?? null },
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
          page_photo: !page.isDoc,
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

      /* The answer belongs in the thread the question was asked in. A caption
         is a question, so Vanta looks at the picture and says what it sees
         here; the Inbox line is a footnote, not the reply. Only a "read this"
         caption goes down the text lane, and even then the words come back. */
      const wantIntent = intentFromCaption(caption);
      let reply: string;

      /* Documents are always read, never looked at — the picture-perception
         lane is for photos only. */
      if (page.isDoc || wantIntent === "text") {
        let read: PageReadResult;
        try {
          read = await readPageFile(admin, fileRec as any);
        } catch {
          read = { ok: false, reason: "reading is paused" };
        }
        let words = "";
        if (read.ok) {
          const { data: note } = await admin.from("notes").select("body").eq("id", read.noteId).maybeSingle();
          words = String(note?.body ?? "").trim();
        }
        /* Same introduction a document gets in the app: what it looks like,
           what came off it, then what can happen next. Words only — the
           buttons below are offers, and none of them execute anything. */
        const intent = objectIntentFor({
          filename: page.name,
          mime: page.mime,
          detectedDocType: (fileRec as any)?.detected_doc_type ?? null,
          confidence: (fileRec as any)?.confidence ?? null,
        });
        reply = read.ok
          ? [
              intent.line,
              "",
              readSummaryLine(words, 900),
              "",
              "Saved in your Inbox. Nothing filed under a project yet.",
              nextStepsLine(intent.kind),
            ].join("\n")
          : `${intent.line}\n\nCouldn't read it just now — it's saved, and the daily sweep will try again.`;
      } else {
        try {
          const look = await lookAtImage(new Blob([bytes]), page.mime, wantIntent, caption || null);
          const said = fitToBody(look.answer, "telegram");
          reply = said
            ? `${said}\n\nSaved in your Inbox. Nothing filed under a project yet.`
            : "I looked, and I couldn't make anything of it. It's saved in your Inbox.";
          await admin.from("audit_log").insert({
            user_id: link.user_id, organization_id: routeOrgId,
            entity_type: "ingested_file", entity_id: fileRec.id, event: "image.looked",
            payload: { source: "telegram", intent: wantIntent, uncertain: look.uncertain },
          });
          await admin.from("ingested_files").update({
            metadata: {
              ...(fileRec.metadata as Record<string, unknown> ?? {}),
              looks: [{ intent: wantIntent, answer: look.answer.slice(0, 2000), at: new Date().toISOString() }],
            },
          }).eq("id", fileRec.id);
        } catch (e) {
          console.error("[vanta] telegram look failed:", e);
          reply = "Didn't run. I couldn't look at that picture just now. Nothing else changed — it's saved in your Inbox.";
        }
      }
      // One deep link back to the Inbox, plus a filing shortcut when there is
      // an obvious project to put it under. Neither button executes anything.
      const suggest = (await listProjects(admin, { userId: link.user_id, orgId: routeOrgId }, 1))[0];
      await logTgMessage(admin, {
        user_id: link.user_id, organization_id: routeOrgId, chat_id: chatId,
        direction: "out", text: reply, kind: "page_reply", sent_by: "vanta",
        entity_type: "ingested_file", entity_id: fileRec.id,
      });
      await tg("sendMessage", {
        chat_id: chatId,
        text: reply,
        disable_web_page_preview: true,
        ...(() => {
          const m = keyboard(
            [suggest ? fileUnderButton(suggest.id, suggest.title, "file", fileRec.id) : null],
            [openButton("inbox")],
          );
          return m ? { reply_markup: m } : {};
        })(),
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    /* --------------------------------------------------------------------- */



    let reply = VANTA_PHRASES.gotIt();
    let markup: TgReplyMarkup | undefined;
    try {
      const out = await aiRespond(admin, link.user_id, text, routeOrgId);
      reply = out.reply;
      markup = out.markup;
    } catch (e) {
      reply = VANTA_PHRASES.telegram.snag();
      console.error("aiRespond error", e);
    }
    await logTgMessage(admin, {
      user_id: link.user_id, organization_id: routeOrgId, chat_id: chatId,
      direction: "out", text: reply, kind: "text", sent_by: "vanta",
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: reply,
      disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("telegram-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
