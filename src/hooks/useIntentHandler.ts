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
  | { kind: "save_artifact"; id?: string; summary: string };

export function useIntentHandler(onAck?: (ack: IntentAck) => void) {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const { mode } = useMode();
  const { prefs } = useUserPreferences();
  // Scope is authoritative: anything Ask creates belongs to the workspace the
  // user is standing in, never to whichever row happened to be default.
  const { withScope, scope } = useScope();

  return useCallback(
    async (kind: string, args: any) => {
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
          toast.success(vantaSay.capturedToMemory());
          onAck?.({ kind: "capture_note", id: data?.id, summary: args.title || (args.body ?? "").slice(0, 80) || "Note" });
        } else if (kind === "stage_action") {
          const { data } = await supabase.from("actions").insert(withScope({
            user_id: user.id,
            title: args.title,
            description: args.description ?? null,
            risk: args.risk ?? "standard",
            status: "staged",
            source: "companion",
          })).select("id").single();
          await audit("actions", { action_id: data?.id });
          toast.success(vantaSay.actionDrafted());
          onAck?.({ kind: "stage_action", id: data?.id, summary: args.title || "Action" });
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
          toast.success(vantaSay.commitmentAdded());
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
          toast.success(vantaSay.reminderCreated(parsed.phrasing));
          onAck?.({ kind: "add_commitment", id: data?.id, summary: args.summary || "Reminder" });
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
          toast.success({ title: who ? `Waiting on ${who}` : "Marked as waiting", description: "It shows in Work until it clears." });
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
          toast.success({ title: "Decision logged", description: "It reads back in the project's brief." });
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
            await supabase.from("project_items").insert(withScope({
              user_id: user.id,
              project_id: args.project_id,
              item_type: "note",
              item_id: data.id,
            }));
          }
          await audit("memory", { note_id: data?.id, as: "artifact", project_id: args.project_id ?? null });
          toast.success({ title: "Artifact saved", description: args.project_id ? "Filed against the project." : "Saved to memory." });
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
    [user, openSherlock, mode, onAck, withScope, scope]
  );
}
