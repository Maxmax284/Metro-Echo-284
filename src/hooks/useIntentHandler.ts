import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generateEmbedding } from "@/lib/embeddings";
import { useSherlock } from "@/components/sherlock/SherlockContext";
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
        toast.warning(`${MODE_LABEL[mode]} mode — intent "${kind}" blocked`, {
          description: "Switch mode in the header to allow this.",
        });
        return;
      }
      try {
        if (kind === "capture_note") {
          const { data } = await supabase
            .from("notes")
            .insert({ user_id: user.id, title: args.title ?? null, body: args.body ?? "" })
            .select("id")
            .single();
          if (data) generateEmbedding("note", data.id);
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
        }
      } catch (e) {
        toast.fromError(e);
      }
    },
    [user, openSherlock, mode, onAck]
  );
}
