import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generateEmbedding } from "@/lib/embeddings";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { formatInTimeZone } from "date-fns-tz";
import { useMode, modeAllows, MODE_LABEL } from "@/hooks/useMode";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";

/**
 * Shared intent handler for the Companion + Conversation Log.
 * All paths are draft-only — never calls actions-execute or transitions to approved.
 * Gated by the user's Companion mode (locked/observer/advisor/operator).
 */
export type IntentAck =
  | { kind: "stage_action"; id?: string; summary: string }
  | { kind: "add_commitment"; id?: string; summary: string }
  | { kind: "capture_note"; id?: string; summary: string };

export function useIntentHandler(onAck?: (ack: IntentAck) => void) {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const { mode } = useMode();

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
            .insert({ user_id: user.id, title: args.title ?? null, body: args.body ?? "" })
            .select("id")
            .single();
          if (data) generateEmbedding("note", data.id);
          await audit("memory", { note_id: data?.id });
          toast.success(vantaSay.capturedToMemory());
          onAck?.({ kind: "capture_note", id: data?.id, summary: args.title || (args.body ?? "").slice(0, 80) || "Note" });
        } else if (kind === "stage_action") {
          const { data } = await supabase.from("actions").insert({
            user_id: user.id,
            title: args.title,
            description: args.description ?? null,
            risk: args.risk ?? "standard",
            status: "staged",
            source: "companion",
          }).select("id").single();
          await audit("actions", { action_id: data?.id });
          toast.success(vantaSay.actionDrafted());
          onAck?.({ kind: "stage_action", id: data?.id, summary: args.title || "Action" });
        } else if (kind === "add_commitment") {
          const remindAt = args.due_at
            ? new Date(new Date(args.due_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
            : null;
          const { data } = await supabase
            .from("commitments")
            .insert({
              user_id: user.id,
              summary: args.summary,
              due_at: args.due_at ?? null,
              remind_at: remindAt,
            })
            .select("id")
            .single();
          if (data) generateEmbedding("commitment", data.id);
          await audit("commitments", { commitment_id: data?.id });
          toast.success(vantaSay.commitmentAdded());
          onAck?.({ kind: "add_commitment", id: data?.id, summary: args.summary || "Commitment" });
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
        }
      } catch (e) {
        toast.fromError(e);
      }
    },
    [user, openSherlock, mode, onAck]
  );
}
