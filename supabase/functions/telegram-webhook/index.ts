// telegram-webhook: receive Telegram updates, route to Echo intent pipeline.
// - Verifies X-Telegram-Bot-Api-Secret-Token (derived from TELEGRAM_API_KEY).
// - Pairing: /start <CODE> links a chat to an Echo user account.
// - Conversation: text messages from a linked chat are routed to AI with the
//   same tools as vanta-converse (capture_note / stage_action / add_commitment),
//   then the assistant reply is sent back to Telegram.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { firstPassIntake } from "../_shared/fileIntake.ts";
import { replyWhyLine } from "../_shared/telegramWhy.ts";
import { buildActionRow } from "../_shared/actionStaging.ts";
import {
  approvalOutcomeLine,
  buildCalendarProposal,
  calendarFieldLabel,
  calendarProposalRisk,
  calendarProposalTitle,
  isCalendarProposal,
  normalizeCalendarChangeField,
  proposalSummary,
  refineCalendarProposal,
  type CalendarFieldChange,
  calendarProposalNeedsDepth,
  settledElsewhereLine,
  withTelegramRef,
} from "../_shared/calendarProposal.ts";
import {
  calendarWriteStateForUser,
  executeCalendarProposal,
  projectCalendarEvent,
  telegramMayAutoExecute,
} from "../_shared/calendarExecute.ts";
import { findConflicts, resolveEventReference, type ResolvableEvent } from "../_shared/calendarResolve.ts";
import {
  answerAfterEvent,
  answerCalendarQuestion,
  clockLabel,
  parseCalendarQuestion,
  type CalReadEvent,
} from "../_shared/calendarRead.ts";
import {
  agendaSpanFromWords,
  buildAgenda,
  type AgendaCommitment,
  type AgendaPendingChange,
} from "../_shared/calendarAgenda.ts";
import { tgCall, tgFetchFile } from "../_shared/telegramApi.ts";
import { routeRequest } from "../_shared/orchestration/capabilityRouter.ts";
import { runFieldIntent } from "../_shared/fieldReply.ts";
import { buildWorkingContext } from "../_shared/workingContext.ts";


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

/* Every outbound Telegram call in the codebase goes through _shared/telegramApi
   now. There used to be three separate raw POST implementations, which meant
   three chances to get the auth headers, the error handling or the retry
   behaviour subtly different. */
async function tg(method: string, body: unknown) {
  const res = await tgCall(method, body);
  /* Shape the reply like a fetch Response so callers can read Telegram's own
     envelope. `tgCall` exposes the parsed result as `result`, never `body` —
     reading the wrong field silently lost every file handed over by chat. */
  return {
    ok: res.ok,
    status: res.status,
    json: async () => ({ ok: res.ok, result: res.result, description: res.reason }),
  } as any;
}



/** Thread record. Every message in or out is kept so the Telegram room inside
 *  Echo shows the real conversation, not a webhook log. Never blocks a reply. */
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
  calendarApprovalButtons,
  fileUnderButton,
  keyboard,
  markDoneButton,
  openButton,
  snoozeMinutesFor,
  SNOOZE_PRESETS,
  type TgReplyMarkup,
  type VantaLinkKind,
} from "../_shared/telegramReplies.ts";
import { objectIntentFor, nextStepsLine, readSummaryLine } from "../_shared/objectIntent.ts";
import { looksLikeCapture } from "../_shared/messageLane.ts";
import {
  capabilityAnswer,
  matchCapabilityQuestion,
  type SenseRow,
} from "../_shared/capabilityStatus.ts";
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
  action: "something waiting on your yes",
  sherlock: "something worth a closer look",
  ignore: "noise to file away",
};

// Telegram shares the exact same voice constants as the in-app surfaces so
// wording stays identical across Companion (chat), Memory (capture), and
// Awareness (place answers). How MUCH gets said is not decided here — it comes
// from the shared response-depth model, so Telegram can never drift into its own
// private compression rules.
const TELEGRAM_CHANNEL = `Telegram channel law:
Telegram is not a remote control — it is the same Echo, in the user's pocket. Same memory,
same calendar, same drafts, same approval spine as the app. Never say "open Metro Echo" for
something you can already do here.
You CAN read: their desks (whats_waiting, whats_due, project_status, whats_changed) and their
calendar (whats_on_calendar). Call the tools instead of guessing — never invent a count, a
time or a name. A read-only calendar feed means you cannot CHANGE a calendar; it has never
meant you cannot READ one.
You CAN propose a calendar change with stage_calendar_change and, when the user then refines it
("actually 3:30"), update that same pending proposal with refine_calendar_change. The user
decides right here with Yes / No. A yes approves only that one change, never future ones.
Say plainly that nothing has changed anywhere until it actually has.
You still cannot export, send, book or pay anything.
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
  { type: "function", function: { name: "stage_calendar_change", description: "Propose a calendar change (move, retitle, relocate, add notes, add a reminder, create, or cancel). Stages a proposal for a Yes/No — it never touches the calendar. Give exact before/after values and pass the user's own wording as event_reference.", parameters: { type: "object", properties: { event_reference: { type: "string", description: "The user's own words for the event, e.g. 'doctor appointment tomorrow'. Omit when creating a new event." }, changes: { type: "array", items: { type: "object", properties: { field: { type: "string", enum: ["time", "title", "location", "description", "reminder", "existence"] }, before: { type: "string" }, after: { type: "string", description: "New value. Omit for a removal or cancellation." } }, required: ["field"], additionalProperties: false } }, attendee_count: { type: "number" }, source_kind: { type: "string" }, source_note: { type: "string", description: "One human line for where this came from, e.g. 'the clinic's Telegram message'." } }, required: ["changes"], additionalProperties: false } } },
  { type: "function", function: { name: "refine_calendar_change", description: "The user is adjusting the calendar change you already showed them (\"actually 3:30\", \"make it the clinic on Sathorn\"). Updates that same pending proposal and re-asks Yes/No. Never creates a second proposal and never touches the calendar.", parameters: { type: "object", properties: { changes: { type: "array", items: { type: "object", properties: { field: { type: "string", enum: ["time", "title", "location", "description", "reminder", "existence"] }, before: { type: "string" }, after: { type: "string", description: "New value. Omit for a removal or cancellation." } }, required: ["field"], additionalProperties: false } } }, required: ["changes"], additionalProperties: false } } },
  { type: "function", function: { name: "add_commitment", description: "Record a commitment.", parameters: { type: "object", properties: { summary: { type: "string" }, due_at: { type: "string" } }, required: ["summary"], additionalProperties: false } } },
  // Read-only questions. These never write anything.
  { type: "function", function: { name: "whats_on_calendar", description: "Read-only: read the user's real ingested calendar. Use for 'what's on my calendar', 'what do I have tomorrow', 'anything conflicting', 'what comes after my appointment'. Pass their exact wording in `when`; pass `event_reference` only when they asked what follows a specific event.", parameters: { type: "object", properties: { when: { type: "string", description: "Their own time wording: 'right now', 'tomorrow', 'Friday', 'anything conflicting tomorrow'." }, event_reference: { type: "string", description: "Their words for one event, when asking what comes after it." } }, additionalProperties: false } } },
  { type: "function", function: { name: "show_calendar_view", description: "Read-only: show a laid-out board of the real calendar for a day or the week ahead, with Echo's read over it (promises due, changes waiting on a yes, collisions). Use for 'show me my day', 'what does my week look like', 'walk me through Friday'. Never writes and never stages.", parameters: { type: "object", properties: { when: { type: "string", description: "Their own wording: 'today', 'tomorrow', 'this week'." }, span: { type: "string", enum: ["day", "week"] } }, additionalProperties: false } } },
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
// is told what Echo noticed, never what to do.
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
      title: `Echo captured ${res.detectedType ?? "an item"}: ${title}`,
      lines: [
        `Captured via: Telegram`,
        `Landed in: ${res.routedTo}`,
        "Nothing was executed — it is waiting for review in Metro Echo.",
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

/**
 * The calendar rows Echo already holds for this person. Always scoped to the
 * user — this function runs on a service-role client, so the filter is the
 * whole safety story. Read-only by construction: it only selects.
 */
async function loadCalendarEvents(sb: SupabaseClient, userId: string): Promise<CalReadEvent[]> {
  const { data } = await sb
    .from("calendar_events")
    .select("feed_id, uid, starts_at, ends_at, title, location, all_day")
    .eq("user_id", userId)
    .gte("starts_at", new Date(Date.now() - 36 * 3600 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as any[]).map((r) => ({
    feed_id: r.feed_id ?? null,
    uid: r.uid ?? null,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? null,
    title: r.title ?? "Untitled",
    location: r.location ?? null,
    all_day: r.all_day ?? null,
  }));
}

/**
 * Echo's read, laid over the calendar: promises that land that day, changes
 * still waiting on a yes. Read-only — loading a board never stages anything.
 */
async function loadAgendaOverlays(
  sb: SupabaseClient,
  userId: string,
): Promise<{ commitments: AgendaCommitment[]; pending: AgendaPendingChange[] }> {
  const [{ data: comms }, { data: staged }] = await Promise.all([
    sb.from("commitments")
      .select("summary, due_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(50),
    sb.from("actions")
      .select("payload, status")
      .eq("user_id", userId)
      .eq("status", "staged")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const pending: AgendaPendingChange[] = ((staged ?? []) as any[])
    .filter((r) => isCalendarProposal(r.payload))
    .map((r) => ({
      title: calendarProposalTitle(r.payload),
      event_uid: r.payload?.event?.uid ?? null,
      event_starts_at: r.payload?.event?.starts_at ?? null,
    }));
  return {
    commitments: ((comms ?? []) as any[]).map((c) => ({
      summary: c.summary ?? "Something you owe",
      due_at: c.due_at ?? null,
    })),
    pending,
  };
}

/** One renderer for /day, /week and "what's my day" — same board every door. */
async function calendarBoard(
  sb: SupabaseClient,
  userId: string,
  tz: string,
  phrase: string,
  spanHint?: string,
) {
  const events = await loadCalendarEvents(sb, userId);
  const parsed = agendaSpanFromWords(phrase);
  const days = spanHint === "week" ? 7 : spanHint === "day" ? 1 : parsed.days;
  const overlays = await loadAgendaOverlays(sb, userId);
  return buildAgenda({
    events,
    commitments: overlays.commitments,
    pending: overlays.pending,
    tz,
    days,
    startOffset: spanHint === "week" ? 0 : parsed.startOffset,
  });
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
    const { data } = await sb.from("actions").insert(buildActionRow({ userId, organizationId: orgId, title: args.title, description: args.description ?? null, risk: args.risk, status: "staged", source: "telegram" })).select("id").single();
    await sb.from("audit_log").insert({ user_id: userId, organization_id: orgId, entity_type: "capture", event: "capture.routed", payload: { source: "telegram", destination: "actions", action_id: data?.id } });
    return { reply: VANTA_PHRASES.actionStaged(args.title), detectedType: "action draft", routedTo: "actions", linkKind: "actions" as VantaLinkKind };
  }
  if (name === "whats_on_calendar") {
    /* Reading the calendar is not a privilege of the app. Same rows, same
       timezone, same wording Ask would use. Nothing here writes. */
    const tz = defaults.timezone || "UTC";
    const events = await loadCalendarEvents(sb, userId);
    const reference = String(args?.event_reference ?? "").trim();
    if (reference) {
      const resolved = resolveEventReference(reference, events as ResolvableEvent[]);
      if (resolved.status === "none") return { reply: `Nothing on your calendar matches "${reference}".`, detectedType: "calendar read", routedTo: null, readOnly: true };
      if (resolved.status === "many") {
        return { reply: `Which one? ${resolved.candidates.map((c) => `${c.title} (${clockLabel(c.starts_at, tz)})`).join(" · ")}`, detectedType: "calendar read", routedTo: null, readOnly: true };
      }
      const anchor = events.find((e) => e.uid === resolved.event.uid && e.starts_at === resolved.event.starts_at) ?? (resolved.event as CalReadEvent);
      const after = answerAfterEvent(anchor, events, { tz });
      return { reply: after.text, detectedType: "calendar read", routedTo: null, readOnly: true };
    }
    const query = parseCalendarQuestion(String(args?.when ?? "right now"));
    const answer = answerCalendarQuestion(query, events, { tz });
    /* The app link only earns its place when there is more to see than fits. */
    return {
      reply: answer.text,
      detectedType: "calendar read",
      routedTo: null,
      readOnly: true,
      markup: answer.deep ? keyboard([openButton("today", { label: "See the full day" })]) : undefined,
    };
  }
  if (name === "refine_calendar_change") {
    /* One pending proposal, adjusted. The version moves up so the buttons the
       user already saw can no longer approve something they never read. */
    const changes: CalendarFieldChange[] = (Array.isArray(args?.changes) ? args.changes : []).map((c: any) => {
      const field = normalizeCalendarChangeField(c?.field);
      return {
        field,
        label: calendarFieldLabel(field),
        before: c?.before != null && String(c.before).trim() ? String(c.before) : null,
        after: c?.after != null && String(c.after).trim() ? String(c.after) : null,
      };
    });
    if (!changes.length) return { reply: "Tell me what should be different and I'll show it again.", detectedType: "calendar change", routedTo: null, readOnly: true };

    const { data: pending } = await sb
      .from("actions")
      .select("id, payload, status")
      .eq("user_id", userId)
      .eq("status", "staged")
      .order("created_at", { ascending: false })
      .limit(10);
    const row = ((pending ?? []) as any[]).find((r) => isCalendarProposal(r.payload));
    if (!row) return { reply: "Nothing's pending to adjust. Tell me the change and I'll show it fresh.", detectedType: "calendar change", routedTo: null, readOnly: true };

    const refined = refineCalendarProposal(row.payload, changes);
    await sb.from("actions").update({
      payload: refined,
      title: calendarProposalTitle(refined),
      description: proposalSummary(refined),
      risk: calendarProposalRisk(refined),
    }).eq("id", row.id).eq("status", "staged");
    await sb.from("audit_log").insert({
      user_id: userId, organization_id: orgId, entity_type: "action", entity_id: row.id,
      event: "action.staged",
      payload: { source: "telegram", as: "calendar_change", refined: true, version: refined.version },
    });
    const ask = calendarProposalRisk(refined) === "high" ? "Still reaches other people. Approve it? Yes / No." : "Approve this change? Yes / No.";
    return {
      reply: `${proposalSummary(refined)}\n\n${ask}`,
      detectedType: "calendar change",
      routedTo: "actions",
      markup: keyboard(calendarApprovalButtons(row.id, refined.version)),
      readOnly: true,
      calendarActionId: row.id as string,
    };
  }
  if (name === "stage_calendar_change") {
    /* Field replies never write to the calendar. This resolves which event is
       meant, shows exact before/after, and stages ONE proposal for a Yes/No.
       Approval is per-proposal and, while the feed is read-only, only holds it. */
    const events = (await loadCalendarEvents(sb, userId)) as ResolvableEvent[];


    const reference = String(args.event_reference ?? "").trim();
    let target: ResolvableEvent | null = null;
    if (reference) {
      const resolved = resolveEventReference(reference, events);
      if (resolved.status === "none") {
        return { reply: `Nothing on your calendar matches "${reference}". Nothing has changed.`, detectedType: "calendar change", routedTo: null, readOnly: true };
      }
      if (resolved.status === "many") {
        return {
          reply: `Which one? ${resolved.candidates.map((c) => c.title).join(" · ")}. Nothing has changed.`,
          detectedType: "calendar change",
          routedTo: null,
          readOnly: true,
        };
      }
      target = resolved.event;
    }

    const changes: CalendarFieldChange[] = (Array.isArray(args.changes) ? args.changes : []).map((c: any) => {
      const field = normalizeCalendarChangeField(c?.field);
      return {
        field,
        label: calendarFieldLabel(field),
        before: c?.before != null && String(c.before).trim() ? String(c.before) : null,
        after: c?.after != null && String(c.after).trim() ? String(c.after) : null,
      };
    });
    if (!changes.length) {
      return { reply: "Tell me what should be different and I'll show you before you decide.", detectedType: "calendar change", routedTo: null, readOnly: true };
    }

    const when = changes.find((c) => c.field === "time" && c.after)?.after ?? null;
    const proposedStart = when ? new Date(when) : null;
    const conflicts =
      proposedStart && !Number.isNaN(proposedStart.getTime())
        ? findConflicts(proposedStart.toISOString(), null, events, target?.uid ?? null)
        : [];

    const proposal = buildCalendarProposal({
      event: target ? {
        feed_id: target.feed_id,
        uid: target.uid,
        starts_at: target.starts_at,
        ends_at: target.ends_at ?? null,
        title: target.title,
        location: (target as any).location ?? null,
      } : null,
      changes,
      attendeeCount: Number(args.attendee_count ?? 0),
      source: args.source_note ? { kind: String(args.source_kind ?? "you"), note: String(args.source_note) } : null,
      conflicts,
      writeState: await calendarWriteStateForUser(userId),
    });

    const { data: staged } = await sb
      .from("actions")
      .insert(
        buildActionRow({
          userId,
          organizationId: orgId,
          title: calendarProposalTitle(proposal),
          description: proposalSummary(proposal),
          risk: calendarProposalRisk(proposal),
          status: "staged",
          source: "telegram",
          payload: proposal,
        }),
      )
      .select("id")
      .single();
    await sb.from("audit_log").insert({
      user_id: userId, organization_id: orgId, entity_type: "action", entity_id: staged?.id ?? null,
      event: "action.staged",
      payload: { source: "telegram", as: "calendar_change", version: proposal.version, write_state: proposal.write_state },
    });

    const risk = calendarProposalRisk(proposal);
    const ask = risk === "high"
      ? "This one reaches other people. Approve it? Yes / No."
      : "Approve this change? Yes / No.";
    /* The app link is an escape hatch for depth, not the way to approve. It only
       shows when there is genuinely more to look at than fits here. */
    const deep = calendarProposalNeedsDepth(proposal);
    return {
      reply: `${proposalSummary(proposal)}\n\n${ask}`,
      detectedType: "calendar change",
      routedTo: "actions",
      markup: staged?.id
        ? keyboard(calendarApprovalButtons(staged.id, proposal.version), ...(deep ? [[openButton("actions")]] : []))
        : undefined,
      calendarActionId: (staged?.id as string | undefined) ?? null,
    };
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
      : { reply: "Couldn't file that. Open Metro Echo and attach it there.", detectedType: null, routedTo: null, readOnly: true };
  }

  return null;
}

/**
 * Telegram's own thread. One conversation per linked chat, created the first
 * time that chat speaks, reused forever after. It used to borrow whichever
 * thread was touched most recently, which meant a pocket message could land in
 * the middle of unrelated desk work — and a brand new user had no thread at
 * all, so their words were dropped on the floor.
 */
async function telegramConversation(
  sb: SupabaseClient,
  userId: string,
  orgId: string | null,
  chatId: string | number,
): Promise<{ id: string } | null> {
  const key = String(chatId);
  const { data: found } = await sb
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("state->>channel", "telegram")
    .eq("state->>chat_id", key)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (found?.id) {
    await sb.from("conversations")
      .update({ organization_id: orgId, last_message_at: new Date().toISOString() })
      .eq("id", found.id);
    return { id: found.id };
  }
  const { data: made, error } = await sb
    .from("conversations")
    .insert({
      user_id: userId,
      organization_id: orgId,
      // "organization" is the wire value Ask reads; "workspace" is user-facing wording only.
      scope: orgId ? "organization" : "personal",
      title: "Telegram",
      auto_titled: true,
      state: { channel: "telegram", chat_id: key },
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("telegram conversation create failed", error.message);
    return null;
  }
  return made ? { id: made.id } : null;
}

async function aiRespond(sb: SupabaseClient, userId: string, text: string, orgId: string | null = null, chatId: string | number | null = null) {
  // Identity questions never reach a model. Fixed copy, one line, done — so no
  // provider or model name can ever be presented as Echo's identity or author.
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

  /* One router for every surface. Telegram no longer decides on its own what a
     sentence means: the same plan Ask would get is computed here, and the field
     phrases ("walk with me", "I'm here", "SOS") are recognized by the shared
     recognizer rather than a Telegram-only regex. */
  const plan = routeRequest({ text, scope: orgId ? "organization" : "personal", organization_id: orgId, verbosity: "brief" });

  // Telegram's own thread — same memory, same scope, just the pocket form of it.
  const conv = chatId == null ? null : await telegramConversation(sb, userId, orgId, chatId);

  if (plan.field) {
    const handled = await runFieldIntent(sb, { userId, orgId }, plan.field, { via: "telegram" });
    if (handled) {
      const reply = `${handled.text}\n\nWhy this? ${handled.why}`;
      /* A walk started in a chat still belongs to the one shared transcript, so
         opening Ask afterwards shows the same conversation. */
      if (conv?.id) {
        await sb.from("messages").insert([
          {
            user_id: userId, organization_id: orgId, conversation_id: conv.id, role: "user", content: text,
            metadata: { source: "telegram", detected_type: plan.field.intent, field_matched: plan.field.matched },
          },
          {
            user_id: userId, organization_id: orgId, conversation_id: conv.id, role: "assistant", content: reply,
            metadata: { source: "telegram", why: handled.why, trip_id: handled.tripId, high_stakes: plan.high_stakes },
          },
        ]);
      }
      /* The button carries the session id, so tapping it lands on the same
         walk in the app rather than a generic room. */
      const btn = handled.link
        ? openButton(handled.link.kind as VantaLinkKind, handled.tripId ? { tripId: handled.tripId } : {})
        : null;
      return { reply, markup: btn ? keyboard([btn]) : undefined };
    }
  }

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

  /* Same working-context assembly Ask uses, so a pocket message knows which
     project is live and what is unresolved instead of guessing from chat. */
  let workBlock = "";
  try {
    const scopedQ = (q: any) => (orgId ? q.eq("user_id", userId).eq("organization_id", orgId) : q.eq("user_id", userId).is("organization_id", null));
    const cands = await buildWorkingContext(sb, scopedQ, { limit: 3 });
    if (cands.length) {
      workBlock = "Where the user left off (real records — use these names, invent nothing):\n" +
        cands.slice(0, 3).map((c) =>
          `- ${c.projectTitle ?? "Unfiled"}: last activity ${c.lastActivityAt}` +
          (c.unresolved.length ? `; open: ${c.unresolved.slice(0, 2).join("; ")}` : "") +
          (c.lastDecision ? `; last decision: ${c.lastDecision}` : "")
        ).join("\n");
    }
  } catch (e) { console.error("telegram working context", e); }

  const planBlock = `Routing plan for this message (from the shared router, obey it):
- capabilities: ${plan.capabilities.join(", ")}
- internal lookups: ${plan.retrieval.length ? plan.retrieval.join(", ") : "none"}
- may prepare an action: ${plan.may_prepare_action ? "yes, as a draft only" : "no"}
- confidence needed before stating something plainly: ${plan.min_confidence}`;

  const sys = [SYSTEM, brandBlock, depthDirective("telegram"), planBlock, timeBlock, workBlock, correctionsBlock, fieldNotesBlock]
    .filter(Boolean).join("\n\n");

  const messages = [{ role: "system", content: sys }, ...history, { role: "user", content: text }];

  /* "What can you see?" is answered from what is actually switched on and
     actually connected — never from the model's guess. It is a read: nothing
     is captured, routed or executed. */
  const intents: string[] = [];
  let detectedType: string | null = null;
  let routedTo: string | null = null;
  let readOnly = false;
  let linkKind: VantaLinkKind | null = null;
  let commitmentId: string | null = null;
  /* A staged calendar change brings its own Yes/No, so it wins over the default
     "open Echo" link. Nothing else in chat gets to supply buttons. */
  let toolMarkup: TgReplyMarkup | undefined;
  /* Which staged calendar change these buttons belong to, so the message can be
     retired when the same action is decided on another surface. */
  let calendarActionId: string | null = null;
  let reply = "";

  if (matchCapabilityQuestion(text)) {
    const consent = (prefs.sensor_consent ?? {}) as Record<string, boolean>;
    const [{ count: feedCount }, { count: linkCount }] = await Promise.all([
      sb.from("calendar_feeds").select("id", { count: "exact", head: true }).eq("user_id", userId),
      sb.from("telegram_chat_links").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    const rows: SenseRow[] = [
      { key: "location", label: "Where you are", on: consent.location === true, helps: "so your day reads for the place you're in" },
      { key: "calendar", label: "Your calendar", on: (feedCount ?? 0) > 0, helps: "so meetings show up in your day" },
      { key: "telegram", label: "Messages here", on: (linkCount ?? 0) > 0, helps: "so anything you send lands in Metro Echo" },
      { key: "motion", label: "Movement and trips", on: consent.motion === true, helps: "so travel time gets measured, not guessed" },
      { key: "wearable", label: "Wearable readings", on: consent.wearable === true, helps: "so a rough night can soften the day" },
    ];
    reply = capabilityAnswer(rows);
    readOnly = true;
  }

  const r = readOnly ? null : await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }),
  });
  if (r && !r.ok) throw new Error(`ai gateway ${r.status}`);
  const j = r ? await r.json() : null;
  const choice = j?.choices?.[0]?.message;
  if (!reply) reply = choice?.content?.trim() ?? "";
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
        toolMarkup = ((res as any).markup as TgReplyMarkup | undefined) ?? toolMarkup;
        calendarActionId = ((res as any).calendarActionId as string | null | undefined) ?? calendarActionId;
      }
    } catch { /* ignore */ }
  }
  if (intents.length) reply = `${reply ? reply + "\n\n" : ""}${intents.join("\n")}`.trim();
  if (!reply) reply = VANTA_PHRASES.gotIt();

  // Stage 7 — audit expansion: when nothing routed, this is an ambiguous capture
  // waiting for review in the Captures lane. Emit a distinct event so the Audit
  // surface can show "front desk" activity, not just executed lifecycle.
  if (!routedTo && !readOnly && looksLikeCapture(text)) {
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
  } else if (looksLikeCapture(text)) {
    /* Only something worth filing waits for review. A question asked in chat is
       conversation — flagging it would turn Today into a second inbox. */
    userMeta.needs_review = true;
    userMeta.confidence = "low";
  } else {
    userMeta.conversation_only = true;
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
        reply = `${reply}\n\nReads like ${lane}. Nothing has changed yet.`.trim();
      }
    } catch { /* best-effort */ }
  }

  /* The same "why this" the screen shows, one line, from recorded outcomes
     only. Field replies already carry theirs; this covers everything else. */
  const whyLine = replyWhyLine({
    routedTo,
    detectedType,
    readOnly,
    needsReview: userMeta.needs_review === true,
    usedRecords: readOnly ? ["your own records in Metro Echo"] : [],
    at: new Date().toISOString(),
  });
  if (whyLine) reply = `${reply}\n\n${whyLine}`;

  // One deep link, at most one action button. Fixed vocabulary only.
  const markup = toolMarkup
    ?? (commitmentId
      ? keyboard([markDoneButton(commitmentId)], [openButton("commitments", { commitmentId })])
      : keyboard([openButton(linkKind ?? "today")]));
  return { reply, markup, calendarActionId };
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
          text: res.ok ? `Filed under ${res.title}.` : "Couldn't file that. Open Metro Echo.",
        });
        if (res.ok) await dropButtons();
        return ok();
      }
      /* Yes / No on ONE staged calendar change. This approves the exact
         proposal that was shown — version has to match, so a refinement
         retires the old buttons. It never executes: while the calendar is a
         read-only feed, an approval holds the change and says so. */
      if (action === "calyes" || action === "calno") {
        const version = Number(parts[2] ?? "0");
        const { data: act } = await admin.from("actions")
          .select("id, status, payload, risk, organization_id, title")
          .eq("id", commitmentId).eq("user_id", cbLink.user_id).maybeSingle();
        if (!act || !isCalendarProposal(act.payload)) {
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not found." });
          await dropButtons();
          return ok();
        }
        const proposal = act.payload;
        if (proposal.version !== version) {
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "That changed since I asked — use the newest message." });
          await dropButtons();
          return ok();
        }
        if (act.status !== "staged") {
          await tg("answerCallbackQuery", {
            callback_query_id: cbId,
            text: act.status === "cancelled" ? "Already dropped." : "Already decided.",
          });
          await dropButtons();
          return ok();
        }
        const to = action === "calyes" ? "approved" : "cancelled";
        const patch: Record<string, unknown> = { status: to };
        if (to === "approved" && act.risk === "high") patch.risk_acknowledged_at = new Date().toISOString();
        const { error: transErr } = await admin.from("actions").update(patch).eq("id", act.id).eq("user_id", cbLink.user_id).eq("status", "staged");
        if (transErr) {
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Couldn't save that. Open Metro Echo." });
          return ok();
        }
        await admin.from("action_events").insert({
          user_id: cbLink.user_id, action_id: act.id, from_status: "staged", to_status: to,
          actor: "user", reason: `telegram ${action === "calyes" ? "yes" : "no"} (v${version})`,
        });
        await admin.from("audit_log").insert({
          user_id: cbLink.user_id, organization_id: act.organization_id ?? null,
          entity_type: "action", entity_id: act.id, event: `transition:staged->${to}`,
          payload: {
            source: "telegram_callback", as: "calendar_change", version,
            write_state: proposal.write_state, title: act.title ?? null,
          },
        });

        // The staged snapshot can be stale — the person may have connected (or
        // disconnected) their own Google account since the proposal was made.
        const liveWriteState = to === "approved"
          ? await calendarWriteStateForUser(cbLink.user_id)
          : proposal.write_state;

        let outcomeText = to === "approved"
          ? approvalOutcomeLine(liveWriteState)
          : "Dropped. Nothing changed.";

        // For connected, non-high-risk calendar changes, Yes also executes now so
        // Telegram is a first-class Echo surface, not a remote control.
        if (
          to === "approved" && liveWriteState === "connected" &&
          telegramMayAutoExecute({ ...proposal, write_state: "connected" })
        ) {
          try {
            const result = await executeCalendarProposal(admin, cbLink.user_id, {
              id: act.id,
              title: act.title,
              payload: proposal,
            });
            await projectCalendarEvent(admin, cbLink.user_id, proposal, result);
            await admin.from("actions").update({
              status: "executed", result, executed_at: new Date().toISOString(),
            }).eq("id", act.id).eq("user_id", cbLink.user_id);
            await admin.from("action_events").insert({
              user_id: cbLink.user_id, action_id: act.id, from_status: "approved", to_status: "executed",
              actor: "executor", reason: "telegram_yes_auto_execute",
            });
            await admin.from("audit_log").insert({
              user_id: cbLink.user_id, organization_id: act.organization_id ?? null,
              entity_type: "action", entity_id: act.id, event: "execute.success",
              payload: { source: "telegram_callback", result },
            });
            outcomeText = "Done. Google confirmed it, and the receipt is saved.";
          } catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : "execution failed";
            await admin.from("audit_log").insert({
              user_id: cbLink.user_id, organization_id: act.organization_id ?? null,
              entity_type: "action", entity_id: act.id, event: "execute.failed",
              payload: { source: "telegram_callback", error: msg },
            });
            outcomeText = `Approved in Metro Echo, but Google couldn't write it: ${msg.slice(0, 120)}. Open Metro Echo to retry.`;
          }
        }

        await tg("answerCallbackQuery", { callback_query_id: cbId, text: outcomeText.slice(0, 190) });
        await dropButtons();
        await logTgMessage(admin, {
          user_id: cbLink.user_id, organization_id: act.organization_id ?? null, chat_id: cbChatId,
          direction: "out", text: outcomeText, kind: "text", sent_by: "vanta",
          entity_type: "action", entity_id: act.id,
        });
        await tg("sendMessage", { chat_id: cbChatId, text: outcomeText, disable_web_page_preview: true });
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
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Couldn't save that. Open Metro Echo." });
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
          await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Couldn't save that. Open Metro Echo." });
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
       text) is a page. Echo reads it and files it for review. It is capture,
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
    /* A voice note, a recorded audio file, or a video note: the same lane as a
       page, read by listening instead of looking. */
    const spoken = msg.voice ?? msg.audio ?? (docMime.startsWith("audio/") ? msg.document : null);
    const page: { fileId: string; mime: string; name: string; isDoc?: boolean; isVoice?: boolean } | null = spoken
      ? {
          fileId: spoken.file_id,
          mime: String(spoken.mime_type ?? "audio/ogg"),
          name: String(
            spoken.file_name ??
              `voice-note-${update.update_id}.${String(spoken.mime_type ?? "audio/ogg").split("/").pop()?.split(";")[0] ?? "ogg"}`,
          ),
          isDoc: true,
          isVoice: true,
        }
      : biggest
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

    /* A file Echo can't take gets a plain answer, not silence. */
    if (!text && !page && msg.document) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "I can't read that type yet. Photos, PDFs, Word documents and voice notes work — and a plain message always does.",
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
        await tg("sendMessage", { chat_id: chatId, text: page.isVoice ? "Already got that voice note — it's in your Inbox." : "Already got that page — it's in your Inbox." });
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

      const dl = await tgFetchFile(filePath);
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
        /* Same introduction an in-app upload gets: a detected type, a low
           confidence (shape only, nothing read), and an Inbox review status.
           This is what makes "Treat as document" reachable from a chat file. */
        ...firstPassIntake({ filename: page.name, mime: page.mime, isVoice: page.isVoice === true, caption }),
        metadata: {
          page_photo: !page.isDoc,
          voice_note: page.isVoice === true,
          telegram_update_id: String(update.update_id),
          chat_id: chatId,
          caption: caption || null,
        },
      }).select("id, user_id, organization_id, filename, mime_type, storage_path, source, metadata").single();
      if (fileErr || !fileRec) {
        console.error("[vanta] telegram page insert failed:", fileErr?.message);
        await tg("sendMessage", { chat_id: chatId, text: "The page landed but I couldn't file it. Open Metro Echo and check the Inbox." });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      await admin.from("audit_log").insert({
        user_id: link.user_id, organization_id: routeOrgId,
        entity_type: "capture", event: "capture.routed",
        payload: { source: "telegram", destination: "files", ingested_file_id: fileRec.id, kind: "page" },
      });

      /* The answer belongs in the thread the question was asked in. A caption
         is a question, so Echo looks at the picture and says what it sees
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
          : `${intent.line}\n\n${page.isVoice ? "Couldn't make out the words just now" : "Couldn't read it just now"} — it's saved, and the daily sweep will try again.`;
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
      const suggestions = await listProjects(admin, { userId: link.user_id, orgId: routeOrgId }, 2);
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
            ...suggestions.map((p) => [fileUnderButton(p.id, p.title, "file", fileRec.id)]),
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
    let calendarActionId: string | null = null;
    try {
      const out = await aiRespond(admin, link.user_id, text, routeOrgId, chatId);
      reply = out.reply;
      markup = out.markup;
      calendarActionId = out.calendarActionId ?? null;
    } catch (e) {
      reply = VANTA_PHRASES.telegram.snag();
      console.error("aiRespond error", e);
    }
    await logTgMessage(admin, {
      user_id: link.user_id, organization_id: routeOrgId, chat_id: chatId,
      direction: "out", text: reply, kind: "text", sent_by: "vanta",
    });
    const sent = await tg("sendMessage", {
      chat_id: chatId,
      text: reply,
      disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
    });
    /* Remember where this proposal's Yes/No lives. If the same action is decided
       in Metro Echo, those buttons are retired instead of asking twice. */
    if (calendarActionId) {
      try {
        const messageId = (await sent.json())?.result?.message_id ?? null;
        if (messageId) {
          const { data: act } = await admin.from("actions")
            .select("payload").eq("id", calendarActionId).eq("user_id", link.user_id).maybeSingle();
          if (act && isCalendarProposal(act.payload)) {
            await admin.from("actions")
              .update({ payload: withTelegramRef(act.payload, { chat_id: Number(chatId), message_id: Number(messageId) }) })
              .eq("id", calendarActionId).eq("status", "staged");
          }
        }
      } catch { /* best-effort: a missing ref only means the buttons stay put */ }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("telegram-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
