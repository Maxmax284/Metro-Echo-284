import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generateEmbedding } from "@/lib/embeddings";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { formatInTimeZone } from "date-fns-tz";
import { useMode, modeAllows, MODE_LABEL } from "@/hooks/useMode";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { parseReminderHint } from "@/lib/reminderParse";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { linkEntities } from "@/lib/entityGraph";
import { useScope } from "@/hooks/useScope";
import { useStageAction } from "@/hooks/useStageAction";
import { askAftermath } from "@/lib/vantaNouns";
import {
  buildCalendarProposal,
  calendarProposalRisk,
  calendarProposalTitle,
  createsCalendarEvent,
  isCalendarProposal,
  proposalSummary,
  refineCalendarProposal,
  type CalendarFieldChange,
} from "@/lib/calendarProposal";
import { findConflicts, resolveEventReference, type ResolvableEvent } from "@/lib/calendarResolve";
import { calendarFieldLabel, calendarWriteState, normalizeCalendarField } from "@/lib/calendarWrite";
import { resolveReminderReference } from "@/lib/reminderActions";
import { readWatchStatus, startWatchFromWords, stopWatchFromWords } from "@/lib/watchApply";
import { getAskSession, setAskMessages } from "@/lib/askSession";
import { hostLabel } from "@/lib/webLook";
import { travelAnswer } from "@/lib/travelAnswer";
import { crossSourceReply, type AnchorRow } from "@/lib/crossSourceAnswer";
import { whereYouStand } from "@/lib/workReads";

/**
 * One reading of a spoken calendar change, shared by staging and refining so
 * the two can never drift. An omitted `after` means removal — same as Telegram.
 */
function mapCalendarChanges(raw: unknown): CalendarFieldChange[] {
  return (Array.isArray(raw) ? raw : []).map((c: any) => {
    const field = normalizeCalendarField(c?.field);
    return {
      field,
      label: calendarFieldLabel(field),
      before: c?.before != null && String(c.before).trim() ? String(c.before) : null,
      after: c?.after != null && String(c.after).trim() ? String(c.after) : null,
    };
  });
}

/**
 * Shared intent handler for the Companion + Conversation Log.
 * All paths are draft-only — never calls actions-execute or transitions to approved.
 * Gated by the user's Companion mode (locked/observer/advisor/operator).
 */
export type IntentAck =
  | { kind: "stage_action"; id?: string; summary: string }
  | { kind: "add_commitment"; id?: string; summary: string }
  | { kind: "capture_note"; id?: string; summary: string }
  | { kind: "mark_waiting"; id?: string; summary: string }
  | { kind: "record_decision"; id?: string; summary: string }
  | { kind: "save_artifact"; id?: string; summary: string }
  /* A watch approves nothing and runs nothing, but the thread still has to say
     truthfully what came of the sentence — including "I couldn't". */
  | { kind: "keep_an_eye_on"; id?: string; summary: string };

export function useIntentHandler(onAck?: (ack: IntentAck) => void) {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const { mode } = useMode();
  const { prefs } = useUserPreferences();
  // Scope is authoritative: anything Ask creates belongs to the workspace the
  // user is standing in, never to whichever row happened to be default.
  const { withScope, scope } = useScope();
  const stageAction = useStageAction();

  /* Provenance rides with the intent: a receipt has to be able to say which
     source, which conversation and which day the draft came from. */
  return useCallback(
    async (kind: string, args: any, provenance?: Record<string, unknown>) => {
      if (!user) return;
      if (!modeAllows(mode, kind)) {
        toast.warning({ title: vantaSay.intentBlocked(MODE_LABEL[mode], kind), description: "Switch mode in the header to allow this." });
        return;
      }
      const audit = async (destination: string, extra: Record<string, any> = {}) => {
        await supabase.from("audit_log").insert({
          user_id: user.id,
          entity_type: "capture",
          event: "capture.routed",
          payload: { source: "companion", destination, intent: kind, ...extra },
        });
      };
      try {
        if (kind === "capture_note") {
          const { data } = await supabase
            .from("notes")
            .insert(withScope({ user_id: user.id, title: args.title ?? null, body: args.body ?? "" }))
            .select("id")
            .single();
          if (data) generateEmbedding("note", data.id);
          if (data?.id) linkEntities({ userId: user.id, source_kind: "note", source_id: data.id, text: `${args.title ?? ""}\n${args.body ?? ""}` });
          await audit("memory", { note_id: data?.id });
          toast.success({ title: vantaSay.capturedToMemory(), description: askAftermath("capture") });
          onAck?.({ kind: "capture_note", id: data?.id, summary: args.title || (args.body ?? "").slice(0, 80) || "Note" });
        } else if (kind === "stage_action") {
          const actionId = await stageAction({
            title: args.title,
            description: args.description ?? null,
            risk: args.risk,
            status: "staged",
            source: "companion",
            payload: provenance ? { provenance } : null,
          });
          await audit("actions", { action_id: actionId });
          toast.success({ title: vantaSay.actionDrafted(), description: askAftermath("action") });
          onAck?.({ kind: "stage_action", id: actionId, summary: args.title || "Action" });
        } else if (kind === "refine_calendar_change") {
          /* Talking a proposal into shape is not a new proposal. The pending one
             is updated in place and its version moves up, so an approval button
             the user already saw can never approve something they never read. */
          const changes = mapCalendarChanges(args?.changes);
          if (!changes.length) {
            toast.warning({ title: "Nothing to change", description: "Tell me what should be different." });
            return;
          }
          const { data: pending } = await supabase
            .from("actions")
            .select("id, payload")
            .eq("user_id", user.id)
            .eq("status", "staged")
            .order("created_at", { ascending: false })
            .limit(10);
          const row = ((pending ?? []) as any[]).find((r) => isCalendarProposal(r.payload));
          if (!row) {
            toast.warning({
              title: "Nothing pending to adjust",
              description: "Tell me the change and I'll show it fresh.",
            });
            return;
          }
          const refined = refineCalendarProposal(row.payload, changes);
          await supabase
            .from("actions")
            .update({
              payload: refined,
              title: calendarProposalTitle(refined),
              description: proposalSummary(refined),
              risk: calendarProposalRisk(refined),
            })
            .eq("id", row.id)
            .eq("status", "staged");
          await audit("actions", { action_id: row.id, as: "calendar_change", refined: true, version: refined.version });
          toast.success({ title: "Updated the change", description: proposalSummary(refined) });
          onAck?.({ kind: "stage_action", id: row.id, summary: calendarProposalTitle(refined) });
        } else if (kind === "stage_calendar_change") {
          /* A calendar change is a staged action like any other: it resolves the
             event first, shows exact before/after, and never touches the
             provider. While the calendar is read-only, approval only holds it. */
          const { data: eventRows } = await supabase
            .from("calendar_events")
            .select("feed_id, uid, starts_at, ends_at, title")
            .gte("starts_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .order("starts_at", { ascending: true })
            .limit(200);
          const events = ((eventRows ?? []) as any[]).map((r) => ({
            feed_id: r.feed_id ?? null,
            uid: r.uid ?? null,
            starts_at: r.starts_at,
            ends_at: r.ends_at ?? null,
            title: r.title ?? "Untitled",
          })) as ResolvableEvent[];

          const reference = String(args.event_reference ?? "").trim();
          let target: ResolvableEvent | null = null;
          if (reference) {
            const resolved = resolveEventReference(reference, events);
            if (resolved.status === "none") {
              const creating = createsCalendarEvent(Array.isArray(args.changes) ? args.changes : []);
              if (!creating) {
                toast.warning({
                  title: "I couldn't find that one",
                  description: `Nothing on the calendar matches "${reference}". Nothing has changed.`,
                });
                return;
              }
            } else if (resolved.status === "many") {
              toast.warning({
                title: "Which one do you mean?",
                description: resolved.candidates.map((c) => c.title).join(" · "),
              });
              return;
            } else {
              target = resolved.event;
            }
          }

          const changes: CalendarFieldChange[] = mapCalendarChanges(args.changes);

          if (!changes.length) {
            toast.warning({ title: "Nothing to change", description: "Tell me what should be different." });
            return;
          }

          const timeChange = changes.find((c) => c.field === "time" && c.after);
          const proposedStart = timeChange?.after ? new Date(timeChange.after) : null;
          const conflicts =
            proposedStart && !Number.isNaN(proposedStart.getTime())
              ? findConflicts(proposedStart.toISOString(), null, events, target?.uid ?? null)
              : [];

          const proposal = buildCalendarProposal({
            event: target
              ? {
                  feed_id: target.feed_id,
                  uid: target.uid,
                  starts_at: target.starts_at,
                  ends_at: target.ends_at ?? null,
                  title: target.title,
                }
              : null,
            changes,
            attendeeCount: Number(args.attendee_count ?? 0),
            source: args.source_note ? { kind: String(args.source_kind ?? "you"), note: String(args.source_note) } : null,
            conflicts,
            writeState: await calendarWriteState(),
          });

          const actionId = await stageAction({
            title: calendarProposalTitle(proposal),
            description: proposalSummary(proposal),
            risk: calendarProposalRisk(proposal),
            status: "staged",
            source: "companion",
            payload: provenance ? { ...proposal, provenance } : proposal,
          });
          await audit("actions", { action_id: actionId, as: "calendar_change" });
          toast.success({
            title: "Calendar change staged",
            description:
              proposal.write_state === "connected"
                ? "Nothing has changed yet — approve it and it goes to your calendar. Say it differently and I'll adjust this same one."
                : "Nothing has changed yet — the calendar is read-only, so approval only holds it.",
          });
          onAck?.({ kind: "stage_action", id: actionId, summary: calendarProposalTitle(proposal) });
        } else if (kind === "add_commitment") {
          const remindAt = args.due_at
            ? new Date(new Date(args.due_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
            : null;
          const { data } = await supabase
            .from("commitments")
            .insert(withScope({
              user_id: user.id,
              summary: args.summary,
              due_at: args.due_at ?? null,
              remind_at: remindAt,
            }))
            .select("id")
            .single();
          if (data) generateEmbedding("commitment", data.id);
          if (data?.id) linkEntities({ userId: user.id, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" });
          await audit("commitments", { commitment_id: data?.id });
          toast.success({ title: vantaSay.commitmentAdded(), description: askAftermath("commitment") });
          onAck?.({ kind: "add_commitment", id: data?.id, summary: args.summary || "Commitment" });
        } else if (kind === "set_reminder") {
          const tz = args.timezone || prefs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          const parsed = parseReminderHint(String(args.when ?? ""), {
            timezone: tz,
            morning: prefs.default_morning_time,
            afternoon: prefs.default_afternoon_time,
            evening: prefs.default_evening_time,
          });
          if (parsed.status === "needs_time") {
            await supabase.from("audit_log").insert({ user_id: user.id, entity_type: "reminder", event: "reminder.needs_time", payload: { source: "companion", summary: args.summary, when: args.when } });
            toast.warning(vantaSay.reminderNeedsTime());
            return;
          }
          if (parsed.status === "needs_ampm") {
            await supabase.from("audit_log").insert({ user_id: user.id, entity_type: "reminder", event: "reminder.needs_ampm", payload: { source: "companion", summary: args.summary, when: args.when } });
            toast.warning(vantaSay.reminderAmPmAsk(parsed.hh, parsed.mm));
            return;
          }
          if (parsed.status === "needs_tz") {
            toast.warning(vantaSay.reminderNeedsTz());
            return;
          }
          const { data } = await supabase.from("commitments").insert(withScope({
            user_id: user.id,
            summary: args.summary,
            due_at: parsed.due_at,
            remind_at: parsed.remind_at,
            metadata: { kind: "reminder", source: "companion", timezone: parsed.timezone, when_hint: args.when },
          })).select("id").single();
          if (data) generateEmbedding("commitment", data.id);
          if (data?.id) linkEntities({ userId: user.id, source_kind: "commitment", source_id: data.id, text: args.summary ?? "" });
          await supabase.from("audit_log").insert({ user_id: user.id, entity_type: "reminder", entity_id: data?.id, event: "reminder.scheduled", payload: { source: "companion", summary: args.summary, due_at: parsed.due_at, timezone: parsed.timezone } });
          toast.success({ title: vantaSay.reminderCreated(parsed.phrasing), description: askAftermath("commitment") });
          onAck?.({ kind: "add_commitment", id: data?.id, summary: args.summary || "Reminder" });
        } else if (kind === "cancel_reminder") {
          const { data: reminders } = await supabase.from("commitments")
            .select("id, summary, due_at, created_at")
            .eq("user_id", user.id).in("status", ["open", "done"]).eq("metadata->>kind", "reminder")
            .order("created_at", { ascending: false }).limit(12);
          const resolved = resolveReminderReference(String(args?.reference ?? "that reminder"), reminders ?? [], new Date());
          if (resolved.status === "none") {
            toast.warning({ title: "No matching reminder", description: "Nothing changed." });
            return;
          }
          if (resolved.status === "many") {
            toast.warning({ title: "Which reminder?", description: resolved.candidates.map((r) => r.summary).join(" · ") });
            return;
          }
          const { error } = await supabase.from("commitments").update({ status: "cancelled" }).eq("id", resolved.reminder.id).eq("user_id", user.id).in("status", ["open", "done"]);
          if (error) throw error;
          await supabase.from("audit_log").insert({ user_id: user.id, entity_type: "commitment", entity_id: resolved.reminder.id, event: "commitment.cancelled", payload: { source: "companion", reason: "user_requested_reminder_removal" } });
          toast.success({ title: "Reminder removed", description: "Your calendar wasn't touched." });
        } else if (kind === "mark_waiting") {
          // Waiting on someone is a promise with a name attached, so it lives
          // where every other promise lives — no parallel table.
          const who = String(args.who ?? "").trim();
          const summary = String(args.summary ?? "").trim() || (who ? `Waiting on ${who}` : "Waiting");
          const { data } = await supabase
            .from("commitments")
            .insert(withScope({
              user_id: user.id,
              summary: who && !summary.toLowerCase().includes(who.toLowerCase()) ? `${summary} — waiting on ${who}` : summary,
              due_at: args.due_at ?? null,
              metadata: { kind: "waiting_on", source: "ask", waiting_on: who || null, project_id: args.project_id ?? null },
            }))
            .select("id")
            .single();
          if (data) generateEmbedding("commitment", data.id);
          await audit("commitments", { commitment_id: data?.id, waiting_on: who || null });
          toast.success({ title: who ? `Waiting on ${who}` : "Marked as waiting", description: askAftermath("commitment") });
          onAck?.({ kind: "mark_waiting", id: data?.id, summary });
        } else if (kind === "record_decision") {
          const summary = String(args.summary ?? "").trim();
          if (!summary) return;
          const { data } = await supabase
            .from("notes")
            .insert(withScope({
              user_id: user.id,
              title: summary.slice(0, 120),
              body: String(args.reasoning ?? summary),
              tags: ["decision"],
              metadata: { kind: "decision", source: "ask", project_id: args.project_id ?? null, decided_at: new Date().toISOString() },
            }))
            .select("id")
            .single();
          if (data) generateEmbedding("note", data.id);
          if (data?.id) linkEntities({ userId: user.id, source_kind: "note", source_id: data.id, text: summary });
          await audit("memory", { note_id: data?.id, as: "decision" });
          toast.success({ title: "Decision logged", description: "Recorded · appears in the project's brief" });
          onAck?.({ kind: "record_decision", id: data?.id, summary });
        } else if (kind === "save_artifact") {
          const title = String(args.title ?? "").trim() || "Artifact";
          const { data } = await supabase
            .from("notes")
            .insert(withScope({
              user_id: user.id,
              title: title.slice(0, 120),
              body: String(args.body ?? args.summary ?? ""),
              tags: ["artifact"],
              metadata: { kind: "artifact", source: "ask", project_id: args.project_id ?? null },
            }))
            .select("id")
            .single();
          if (data) generateEmbedding("note", data.id);
          // Filed against a project when Ask knew which one; otherwise it sits
          // in Memory with its aftermath tray, never orphaned.
          if (data?.id && args.project_id) {
            await supabase.from("project_items").insert({
              added_by: user.id,
              project_id: args.project_id,
              item_type: "note",
              item_id: data.id,
            });
          }
          await audit("memory", { note_id: data?.id, as: "artifact", project_id: args.project_id ?? null });
          toast.success({ title: "Artifact saved", description: askAftermath("artifact", args.project_id ? "the project" : null) });
          onAck?.({ kind: "save_artifact", id: data?.id, summary: title });
        } else if (kind === "run_sherlock") {
          openSherlock({
            entity_type: "freeform",
            title: (args.text ?? "").slice(0, 80),
            text: args.text ?? "",
          });
        } else if (kind === "query_awareness") {
          const question = String(args.question ?? "").trim();
          if (!question) return;
          const { data, error } = await supabase.functions.invoke("awareness-query", {
            body: { question, section: args.section ?? null },
          });
          if (error || (data as any)?.error) {
            throw new Error((data as any)?.error || error?.message || "awareness query failed");
          }
          const { answer, confidence, place } = data as {
            answer: string;
            confidence: string;
            place: { label: string; id?: string } | null;
          };
          const tag = place ? `📍 ${place.label} · confidence: ${confidence}` : `confidence: ${confidence}`;
          const composed = `${answer}\n\n_${tag}_`;
          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv?.id) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: conv.id,
              role: "assistant",
              content: composed,
              metadata: { source: "awareness", confidence, place_id: place?.id ?? null },
            });
          }
          toast.success(vantaSay.awarenessAnswered(place?.label));
        } else if (kind === "keep_an_eye_on") {
          const res = await startWatchFromWords(supabase as never, user.id, scope.organizationId, {
            reference: String(args.reference ?? ""),
            kind: args.kind === "action" ? "action_settled" : args.kind === "calendar_event" ? "calendar_event" : "unknown",
            source: "ask",
          });
          toast.success({ title: res.reply });
          onAck?.({ kind: "keep_an_eye_on", id: res.watchId ?? undefined, summary: res.reply });
        } else if (kind === "stop_watching") {
          const res = await stopWatchFromWords(supabase as never, user.id, {
            reference: String(args.reference ?? ""),
          });
          toast.success({ title: res.reply });
          onAck?.({ kind: "keep_an_eye_on", id: res.watchId ?? undefined, summary: res.reply });
        } else if (kind === "whats_being_watched") {
          const res = await readWatchStatus(supabase as never, user.id);
          toast.success({ title: res.reply });
          onAck?.({ kind: "keep_an_eye_on", summary: res.reply });
        } else if (kind === "where_do_i_stand") {
          /* State compression: one compact read of the whole board — waiting on
             you, open, moved, can wait, already handled. Same code Telegram
             calls, so the two answers can never drift. Reads only. */
          const { text } = await whereYouStand(supabase as never, {
            userId: user.id,
            orgId: scope.organizationId,
          });
          /* The answer belongs in the thread that asked. Falling back to the
             most recently touched conversation dropped it into whichever thread
             spoke last — usually Telegram — so the person who asked in Ask saw
             nothing come back. */
          let threadId = typeof provenance?.conversation_id === "string" ? provenance.conversation_id : null;
          if (!threadId) {
            const { data: conv } = await supabase
              .from("conversations")
              .select("id")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            threadId = conv?.id ?? null;
          }
          if (threadId) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: threadId,
              role: "assistant",
              content: text,
              metadata: { source: "companion_query", intent: kind },
            });
          }
          toast.success({ title: "Here's where you stand." });
        } else if (kind === "search_mail" || kind === "find_file") {
          // Your own Google, read only. Not switched on is said plainly — Echo
          // never guesses what a message or a file said.
          //
          // What comes back is not reported source by source. It is read
          // against what is already on the board — the calendar entries and
          // promises you have — so an email about an appointment lands as one
          // conclusion about that appointment instead of a second pile.
          const mail = kind === "search_mail";
          const question = String(mail ? args.question ?? "" : args.query ?? "").trim();
          const { data: res } = await supabase.functions.invoke(
            mail ? "gmail-read" : "drive-find",
            { body: mail ? { question } : { query: question } },
          );
          const payload = (res ?? {}) as {
            connected?: boolean;
            conclusion?: string | null;
            items?: { id?: string; fromName?: string; subject?: string; date?: string; snippet?: string }[];
            files?: { id?: string; name?: string; webViewLink?: string; link?: string; modifiedAt?: string }[];
          };
          let composed: string;
          if (payload.connected === false) {
            composed = mail
              ? "Gmail is not switched on for your account. You can turn it on in Settings, under Google."
              : "Drive is not switched on for your account. You can turn it on in Settings, under Google.";
          } else {
            const mailRows = mail ? (payload.items ?? []).slice(0, 5) : [];
            /* drive-find answers with `files`; older shapes used `items`. */
            const fileRows = mail ? [] : (payload.files ?? []).slice(0, 5);
            const found = mail ? mailRows.length : (fileRows ?? []).length;
            if (found === 0) {
              composed = mail
                ? "Nothing in your mail matches that."
                : "No file in your Drive matches that name.";
            } else {
              const lines = mail
                ? mailRows.map((r) => `• **${r.subject ?? "(no subject)"}** — ${r.fromName ?? "someone"}`)
                : (fileRows ?? []).map((r) => `• [${r.name ?? "file"}](${r.webViewLink ?? r.link ?? "#"})`);
              const fallback = [payload.conclusion ?? null, lines.join("\n")].filter(Boolean).join("\n\n");

              /* What is already on the board, so a new fact can modify a
                 situation instead of starting one. Recorded rows only. */
              const anchors: AnchorRow[] = [];
              const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
              const { data: eventAnchors } = await supabase
                .from("calendar_events")
                .select("id, title, location, starts_at")
                .gte("starts_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
                .lte("starts_at", horizon)
                .order("starts_at", { ascending: true })
                .limit(30);
              for (const e of eventAnchors ?? []) {
                anchors.push({
                  id: String(e.id),
                  kind: "calendar",
                  title: String(e.title ?? ""),
                  at: e.starts_at ?? null,
                  location: e.location ?? null,
                });
              }
              const { data: openPromises } = await supabase
                .from("commitments")
                .select("id, summary, due_at")
                .eq("status", "open")
                .limit(30);
              for (const c of openPromises ?? []) {
                anchors.push({
                  id: String(c.id),
                  kind: "commitment",
                  title: String(c.summary ?? ""),
                  at: c.due_at ?? null,
                });
              }

              composed = crossSourceReply({
                anchors,
                mail: mail
                  ? mailRows.map((r) => ({
                      id: String(r.id ?? r.subject ?? Math.random()),
                      subject: r.subject ?? null,
                      fromName: r.fromName ?? null,
                      date: r.date ?? null,
                      snippet: r.snippet ?? null,
                    }))
                  : [],
                files: mail
                  ? []
                  : (fileRows ?? []).map((r) => ({
                      id: String(r.id ?? r.name ?? Math.random()),
                      name: r.name ?? null,
                      modifiedAt: r.modifiedAt ?? null,
                      link: r.webViewLink ?? r.link ?? null,
                    })),
                fallback,
              }).text;
            }
          }
          /* The answer belongs to the thread that asked, not whichever
             conversation happened to be touched last. */
          let convId = typeof provenance?.conversation_id === "string" ? provenance.conversation_id : null;
          if (!convId) {
            const { data: conv } = await supabase
              .from("conversations")
              .select("id")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            convId = conv?.id ?? null;
          }
          if (convId) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: convId,
              role: "assistant",
              content: composed,
              metadata: { source: mail ? "gmail" : "drive", provenance: "google", question },
            });
          }
          toast.success({ title: mail ? "Checked your mail." : "Looked in your Drive." });
        } else if (kind === "check_page" || kind === "look_up") {
          /* The last resort, in order: your own sources first, then a page you
             point at, then the open web. Reading only — Echo does not sign in,
             submit anything, book, cancel or pay. Where it came from is always
             said out loud. */
          const page = kind === "check_page";
          const wantsWatch = page && args.watch === true;
          const url = String(args.url ?? "").trim();
          const asked = String(args.question ?? "").trim();

          const { data: res } = await supabase.functions.invoke("web-look", {
            body: page
              ? { mode: wantsWatch ? "watch" : "read", url, question: asked, why: asked || null }
              : { mode: "search", question: asked },
          });
          const payload = (res ?? {}) as {
            ok?: boolean;
            answer?: string | null;
            sitrep?: string | null;
            source?: string | null;
            behind_login?: boolean;
            host?: string | null;
            title?: string | null;
            url?: string | null;
            hits?: { title?: string; url?: string; snippet?: string }[];
          };

          let composed: string;
          if (page) {
            composed = [payload.answer ?? "Echo could not read that page.", payload.source ? `_${payload.source}_` : null]
              .filter(Boolean)
              .join("\n\n");
          } else if (payload.sitrep) {
            /* The sitrep is the ground truth — Echo read the reporting and
               synthesized what actually matters. Sources ride in metadata. */
            composed = [
              payload.sitrep,
              `\n_Echo read ${payload.hits?.length ?? 0} live source${(payload.hits?.length ?? 0) === 1 ? "" : "s"} just now._`,
            ].join("");
          } else if (payload.hits?.length) {
            composed = [
              `Here is what the web says about “${asked}”. Echo only read it, nothing more.`,
              ...payload.hits.slice(0, 5).map((h) => `• ${h.title ?? h.url} — ${h.snippet ?? ""}\n  ${h.url ?? ""}`),
            ].join("\n");
          } else {
            composed = payload.answer ?? "Nothing useful came back from the web on that one.";
          }

          /* Provenance the follow-ups can act on: what was asked, where it
             came from and when — so "keep me updated" and "show affected
             areas" ride with the answer itself. */
          const meta = {
            source: page ? "web_page" : "web_search",
            provenance: "web",
            url: page ? url : null,
            question: asked || null,
            watching: wantsWatch,
            checked_at: new Date().toISOString(),
            sources: page
              ? payload.url
                ? [{ host: payload.host ?? hostLabel(payload.url), url: payload.url, title: payload.title ?? null }]
                : url
                  ? [{ host: hostLabel(url), url, title: null as string | null }]
                  : []
              : (payload.hits ?? [])
                  .slice(0, 4)
                  .map((h) => ({
                    host: h.url ? hostLabel(h.url) : "",
                    url: h.url ?? "",
                    title: h.title ?? null,
                  }))
                  .filter((s) => s.host && s.url),
          };

          /* Same law as above: the thread that asked gets the answer. */
          let convId = typeof provenance?.conversation_id === "string" ? provenance.conversation_id : null;
          if (!convId) {
            const { data: conv } = await supabase
              .from("conversations")
              .select("id")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            convId = conv?.id ?? null;
          }
          if (convId) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: convId,
              role: "assistant",
              content: composed,
              metadata: meta,
            });
            /* And the open thread sees it now, not on the next visit — but
               only when a live session is already there to receive it. A
               thread nobody is watching loads it from the record instead. */
            const sess = getAskSession(convId);
            if (sess.hydrated || sess.messages.length) {
              setAskMessages(
                convId,
                ((prev: unknown[]) => [
                  ...prev,
                  { role: "assistant", content: composed, metadata: meta },
                ]) as never,
                { hydrated: true },
              );
            }
          }
          if (wantsWatch && payload.ok) {
            onAck?.({ kind: "keep_an_eye_on", summary: payload.answer ?? "Echo is watching that page." });
          }
          toast.success({
            title: page
              ? wantsWatch
                ? "Echo is watching that page."
                : "Read that page."
              : "Looked it up.",
          });
        } else if (kind === "travel_time") {
          /* How long the road takes to something already on the calendar.
             Recorded ground truth only: the fix Echo is using, the address on
             the entry, and a real road route. Anything missing is said plainly
             rather than estimated. */
          const reference = String(args.reference ?? "").trim();
          let tz = "UTC";
          try {
            const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
            tz = prof?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          } catch { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }

          const nowMs = Date.now();
          const { data: eventRows } = await supabase
            .from("calendar_events")
            .select("id, uid, feed_id, title, location, starts_at, ends_at")
            .gte("starts_at", new Date(nowMs - 60 * 60 * 1000).toISOString())
            .lte("starts_at", new Date(nowMs + 14 * 24 * 3600 * 1000).toISOString())
            .order("starts_at", { ascending: true })
            .limit(200);
          const events = ((eventRows ?? []) as any[]).map((e) => ({
            feed_id: e.feed_id ?? null,
            uid: e.uid ?? null,
            starts_at: e.starts_at,
            ends_at: e.ends_at ?? null,
            title: e.title ?? "",
            location: e.location ?? null,
          }));

          let composed: string;
          const resolution = reference
            ? resolveEventReference(reference, events as ResolvableEvent[])
            : events.length
              ? ({ status: "one", event: events[0] } as const)
              : ({ status: "none" } as const);

          if (resolution.status === "none") {
            composed = reference
              ? `Nothing on your calendar matches “${reference}”, so there is no drive to work out.`
              : "There is nothing coming up on your calendar to drive to.";
          } else if (resolution.status === "many") {
            composed = [
              "More than one thing matches that. Which one?",
              ...resolution.candidates.map(
                (c) => `• ${c.title} — ${formatInTimeZone(new Date(c.starts_at), tz, "EEE h:mm a")}`,
              ),
            ].join("\n");
          } else {
            const picked = events.find(
              (e) => e.title === resolution.event.title && e.starts_at === resolution.event.starts_at,
            ) ?? { ...resolution.event, location: null as string | null };

            const { data: placeRow } = await supabase
              .from("awareness_places")
              .select("label, geo")
              .is("archived_at", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const geo = (placeRow?.geo ?? null) as { lat?: number; lon?: number } | null;
            const fromLat = Number(geo?.lat);
            const fromLon = Number(geo?.lon);

            if (!Number.isFinite(fromLat) || !Number.isFinite(fromLon)) {
              composed =
                "I do not know where you are standing right now, so I cannot work out the drive. Set your place in Aware and ask me again.";
            } else if (!picked.location?.trim()) {
              composed = travelAnswer(
                { title: picked.title, starts_at: picked.starts_at, location: null },
                { durationS: null, distanceM: null },
                tz,
                nowMs,
              );
            } else {
              const { data: legRes } = await supabase.functions.invoke("awareness-travel-times", {
                body: {
                  from: { lat: fromLat, lon: fromLon },
                  to: [{ id: "target", query: picked.location.trim() }],
                },
              });
              const leg = (((legRes as any)?.legs ?? []) as any[])[0] ?? null;
              composed = travelAnswer(
                { title: picked.title, starts_at: picked.starts_at, location: picked.location },
                {
                  durationS: Number.isFinite(Number(leg?.duration_s)) ? Number(leg.duration_s) : null,
                  distanceM: Number.isFinite(Number(leg?.distance_m)) ? Number(leg.distance_m) : null,
                },
                tz,
                nowMs,
              );
              if (placeRow?.label) composed += `\n\n_from ${placeRow.label}_`;
            }
          }

          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv?.id) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: conv.id,
              role: "assistant",
              content: composed,
              metadata: { source: "travel_time", provenance: "calendar+map", reference: reference || null },
            });
          }
          toast.success({ title: "Worked out the drive." });
        } else if (kind === "query_schedule") {


          const window = String(args.window ?? "today");
          // Resolve tz: stored profile timezone falls back to browser
          let tz = "UTC";
          try {
            const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
            tz = prof?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          } catch { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }

          const now = new Date();
          const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
          const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 3600 * 1000);
          const endOfWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

          const { data: rows } = await supabase.from("commitments")
            .select("id, summary, due_at, remind_at, status, priority")
            .eq("status", "open")
            .or("due_at.not.is.null,remind_at.not.is.null")
            .limit(100);
          const all = (rows ?? []) as any[];

          // Doctrine: time is real. Each row has up to two trigger moments —
          // due_at (deadline) and remind_at (poke). Pick the soonest still
          // meaningful one per row and tag what it is so the user knows
          // whether they're looking at a deadline or a reminder.
          type Slot = { row: any; at: Date; kind: "due" | "remind" };
          const slots: Slot[] = [];
          for (const c of all) {
            if (c.due_at)    slots.push({ row: c, at: new Date(c.due_at),    kind: "due" });
            if (c.remind_at) slots.push({ row: c, at: new Date(c.remind_at), kind: "remind" });
          }
          slots.sort((a, b) => a.at.getTime() - b.at.getTime());

          let picked: Slot[] = [];
          if (window === "today")        picked = slots.filter((s) => s.at <= endOfToday && s.at >= new Date(endOfToday.getTime() - 24 * 3600 * 1000));
          else if (window === "tomorrow") picked = slots.filter((s) => s.at > endOfToday && s.at <= endOfTomorrow);
          else if (window === "week")     picked = slots.filter((s) => s.at <= endOfWeek && s.at >= now);
          else if (window === "overdue")  picked = slots.filter((s) => s.at < now);
          else if (window === "next")     picked = slots.filter((s) => s.at > now).slice(0, 1);

          // Dedupe: if a row has both due+remind in the same window, keep the
          // deadline (kind=due) since that's the harder ground truth.
          const seen = new Map<string, Slot>();
          for (const s of picked) {
            const prev = seen.get(s.row.id);
            if (!prev || (prev.kind === "remind" && s.kind === "due")) seen.set(s.row.id, s);
          }
          const filtered = Array.from(seen.values());

          const lines = filtered.length
            ? filtered.map(({ row, at, kind }) => {
                const stamp = formatInTimeZone(at, tz, "EEE MMM d · h:mm a");
                const tag = kind === "remind" ? "⏰" : "•";
                const label = kind === "remind" ? "remind" : "due";
                return `${tag} **${row.summary}** — ${label} ${stamp} ${tz}`;
              }).join("\n")
            : `Nothing on the board for ${window}.`;

          const header = window === "today" ? "Today" : window === "tomorrow" ? "Tomorrow" : window === "week" ? "Next 7 days" : window === "overdue" ? "Overdue" : "Next up";
          const composed = `**${header}** (${tz})\n\n${lines}`;

          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv?.id) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: conv.id,
              role: "assistant",
              content: composed,
              metadata: { source: "schedule", window, timezone: tz, count: filtered.length },
            });
          }
          await supabase.from("audit_log").insert({
            user_id: user.id,
            entity_type: "schedule",
            event: "companion.query.schedule",
            payload: { window, timezone: tz, count: filtered.length },
          });
          toast.success({ title: `Schedule pulled (${header.toLowerCase()})` });
        } else if (kind === "query_waiting" || kind === "query_files_needing_review" || kind === "query_aftermath") {
          // Doctrine: companion can answer "what's waiting / what happened to X"
          // from existing data first — no AI unless the user asks for narrative.
          let composed = "";
          if (kind === "query_waiting") {
            const { data: capts } = await supabase.from("messages")
              .select("id, content, created_at, metadata")
              .eq("role", "user")
              .filter("metadata->>needs_review", "eq", "true")
              .order("created_at", { ascending: false })
              .limit(20);
            const lines = (capts ?? []).map((m: any) =>
              `• ${(m.content ?? "").slice(0, 90)}${(m.content ?? "").length > 90 ? "…" : ""}`
            );
            composed = lines.length
              ? `**Still waiting on you** (${lines.length})\n\n${lines.join("\n")}`
              : "Nothing waiting on you. Clean desk.";
          } else if (kind === "query_files_needing_review") {
            const { data: files } = await supabase.from("ingested_files")
              .select("id, filename, status, metadata, created_at")
              .order("created_at", { ascending: false })
              .limit(40);
            const needing = (files ?? []).filter((f: any) =>
              !f.metadata?.archived && (!f.metadata?.document_type || f.status === "failed" || f.status === "error")
            ).slice(0, 15);
            const lines = needing.map((f: any) => {
              const why = f.status === "failed" || f.status === "error"
                ? "couldn't read"
                : "needs a type";
              return `• ${f.filename} — ${why}`;
            });
            composed = lines.length
              ? `**Files needing review** (${lines.length})\n\n${lines.join("\n")}`
              : "All files are filed. Nothing waiting.";
          } else if (kind === "query_aftermath") {
            const entityId = String(args.entity_id ?? "").trim();
            const label = String(args.label ?? args.summary ?? "this item").trim();
            if (!entityId) {
              composed = "Tell me which item — paste the ID or tap one from Memory/Files.";
            } else {
              const { data: trail } = await supabase.from("audit_log")
                .select("event, payload, created_at, entity_type")
                .eq("entity_id", entityId)
                .order("created_at", { ascending: true })
                .limit(50);
              const lines = (trail ?? []).map((r: any) => {
                const when = new Date(r.created_at).toLocaleString();
                return `• ${when} — ${r.event}`;
              });
              composed = lines.length
                ? `**What happened to ${label}**\n\n${lines.join("\n")}`
                : `No receipts yet for ${label}. Either it's fresh, or nothing has touched it.`;
            }
          }

          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv?.id) {
            await supabase.from("messages").insert({
              user_id: user.id,
              conversation_id: conv.id,
              role: "assistant",
              content: composed,
              metadata: { source: "companion_query", intent: kind },
            });
          }
          await supabase.from("audit_log").insert({
            user_id: user.id,
            entity_type: "companion_query",
            event: `companion.${kind}`,
            payload: { args },
          });
          toast.success({ title: "Pulled it up." });
        }
      } catch (e) {
        toast.fromError(e);
      }
    },
    [user, openSherlock, mode, onAck, withScope, scope, stageAction]
  );
}
