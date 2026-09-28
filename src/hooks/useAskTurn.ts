// useAskTurn — the one Ask turn engine.
//
// Doctrine: one Echo, one conversation pipeline. The Ask room, the quick panel
// and the inline reply on a heads-up all send through here, so a reply typed on
// a card is the same turn as a question asked in Ask: same thread, same
// staging path, same receipts, nothing executing on its own.
import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useIntentHandler, type IntentAck } from "@/hooks/useIntentHandler";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { detectDeviceClass } from "@/lib/deviceClass";
import { attachmentHints, type AttachmentHint } from "@/lib/askCapabilities";
import { RECEIPT_META } from "@/lib/askReceipts";
import type { ThreadContext } from "@/lib/askThreads";
import {
  getAskSession, setAskMessages, beginAskStream, endAskStream, adoptAskSession,
} from "@/lib/askSession";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vanta-converse`;

export type AskReceipt = { kind: IntentAck["kind"]; summary: string; surface: string };
export type AskMsg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  receipt?: AskReceipt;
  metadata?: {
    source?: string;
    detected_type?: string;
    routed_to?: string;
    needs_review?: boolean;
    /** Plain-English lookups Echo ran before writing this answer. */
    reads?: string[];
    /* Live-world provenance: an answer Echo really fetched from the web
       carries where it came from, so follow-ups can ride on it. */
    provenance?: string;
    url?: string | null;
    question?: string | null;
    watching?: boolean;
    checked_at?: string | null;
    sources?: { host: string; url: string; title?: string | null }[];
  } | null;

};

/** Staged attachments, when the host surface offers them. */
type Attachments = {
  staged: { file: File }[];
  commitAll: () => Promise<{ status: string; file: File; ingestedFileId?: string | null }[]>;
  clearCompleted: () => void;
};

export type SendOptions = {
  /** Send into a specific thread instead of whatever is open. */
  threadId?: string;
  /** Bind (or reuse) a thread for this record before sending. */
  context?: ThreadContext;
  /** Extra provenance carried onto anything staged this turn. */
  intentMeta?: Record<string, unknown>;
};

export function useAskTurn(opts?: {
  /** Live staged-upload controller, when the host has one. */
  attachments?: Attachments | null;
  /** Called after a draft or note lands, for host-side aftermath. */
  onReceipt?: (ack: IntentAck) => void;
}) {
  const { session } = useAuth();
  const { scope } = useScope();
  const { activeId, active, ensureThread, noteActivity, recordOutput } = useAskThreads();

  const attachRef = useRef<Attachments | null | undefined>(opts?.attachments);
  attachRef.current = opts?.attachments;
  const receiptRef = useRef(opts?.onReceipt);
  receiptRef.current = opts?.onReceipt;
  // The staging path writes a receipt line into the thread it belongs to.
  const threadForIntent = useRef<string | null>(null);

  const internalIntent = useIntentHandler((ack) => {
    const meta = RECEIPT_META[ack.kind];
    receiptRef.current?.(ack);
    if (!meta) return;
    const tid = threadForIntent.current;
    if (tid && ack.kind !== "keep_an_eye_on") {
      const outKind =
        ack.kind === "stage_action" ? "draft" : ack.kind === "add_commitment" ? "commitment" : "note";
      void recordOutput(tid, outKind);
    }
    if (!tid) return;
    setAskMessages(
      tid,
      ((prev: AskMsg[]) => [
        ...prev,
        {
          role: "system" as const,
          content: ack.summary,
          receipt: { kind: ack.kind, summary: ack.summary, surface: meta.surface },
        },
      ]) as never,
      { hydrated: true },
    );
  });

  const send = useCallback(async (text: string, o?: SendOptions) => {
    if (!session) return;
    const openId = o?.threadId ?? activeId;
    const threadId = o?.threadId ?? (o?.context ? await ensureThread(o.context) : activeId ?? (await ensureThread()));
    if (!threadId) return;
    // A line typed before the thread existed carries over, so the quick panel
    // and the Ask room look at the same session.
    if (!openId) adoptAskSession("_none", threadId);
    threadForIntent.current = threadId;

    const write = (u: (prev: AskMsg[]) => AskMsg[]) =>
      setAskMessages(threadId, u as never, { hydrated: true });
    const firstTurn = (getAskSession(threadId).messages as AskMsg[]).length === 0;
    write((p) => [...p, { role: "user", content: text }, { role: "assistant", content: "" }]);
    /* The streaming writer targets this exact message, never "the last one":
       a follow-up landing mid-stream must not steal the caret's place. */
    const aIdx = (getAskSession(threadId).messages as AskMsg[]).length - 1;

    const ctrl = new AbortController();
    beginAskStream(threadId, ctrl);
    let aborted = false;
    let assistantSoFar = "";
    const staged: { name: string; args?: Record<string, unknown> }[] = [];
    /* Plain-English provenance for the reads the server ran this turn. */
    const readLines: string[] = [];
    let hints: AttachmentHint[] = [];

    const bound = o?.context ?? (active && active.id === threadId
      ? { kind: active.context_kind, id: active.context_id, label: active.context_label }
      : null);

    try {
      if (attachRef.current?.staged.length) {
        const settled = await attachRef.current.commitAll();
        hints = attachmentHints(
          settled
            .filter((s) => s.status === "saved" || s.status === "reading")
            .map((s) => ({ name: s.file.name, type: s.file.type, ingestedFileId: s.ingestedFileId })),
        );
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: threadId,
          message: text,
          scope: { type: scope.type, organization_id: scope.organizationId },
          device: detectDeviceClass(),
          ...(hints.length ? { attachments: hints } : {}),
        }),
        signal: ctrl.signal,
      });

      if (resp.status === 429) throw new Error("Rate limited — please slow down a moment.");
      if (resp.status === 402) throw new Error("Workspace AI credits exhausted.");
      if (!resp.ok || !resp.body) throw new Error("Conversation failed.");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          /* "[DONE]" ends the words, not the turn: the draft Echo prepared
             arrives after it. Keep reading until the stream itself closes. */
          if (json === "[DONE]") continue;
          try {
            const p = JSON.parse(json);
            const delta = p.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantSoFar += delta;
              write((prev) =>
                prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m)),
              );
            }
            /* The reads Echo performed before it wrote a word. These arrive
               ahead of the text and are kept with the answer so "Why this?"
               names real lookups instead of guessing at them. */
            if (Array.isArray(p.reads)) readLines.push(...p.reads.map(String));
            if (p.intent) {
              /* One staging path only. Anything else double-writes the draft. */
              staged.push(p.intent);
              void internalIntent(p.intent.name, p.intent.args, {
                surface: "ask",
                conversation_id: threadId,
                asked_at: new Date().toISOString(),
                question: text.slice(0, 300),
                ...(bound?.kind ? { context_kind: bound.kind } : {}),
                ...(bound?.id ? { context_id: bound.id } : {}),
                ...(bound?.label ? { context_label: bound.label } : {}),
                ...(o?.intentMeta ?? {}),
                ...(p.intent.grounding?.sources?.length
                  ? { sources: p.intent.grounding.sources }
                  : hints.length
                    ? { sources: hints.map((h) => ({ name: h.name, file_id: h.ingested_file_id ?? null })) }
                    : {}),
              });
            }
          } catch { /* partial */ }
        }
      }

      /* A turn that only prepares a draft still has to be readable tomorrow.
         Keeping an eye on something approves nothing and runs nothing, so it
         must not be described as waiting for approval. */
      const WATCH_INTENTS = new Set(["keep_an_eye_on", "stop_watching", "whats_being_watched", "where_do_i_stand"]);
      const stagedLine = staged.length
        ? staged.map((s) => {
            const a = (s.args ?? {}) as Record<string, unknown>;
            const what = String(a.title ?? a.summary ?? a.text ?? a.reference ?? "").trim();
            if (WATCH_INTENTS.has(s.name)) return "";
            return `Drafted for approval${what ? `: ${what}` : ""}. Nothing has run.`;
          }).join("\n")
        : "";
      const finalContent = aborted && assistantSoFar
        ? `${assistantSoFar}\n\n_Stopped._`
        : (assistantSoFar || stagedLine);
      if (aborted || (!assistantSoFar && stagedLine)) {
        write((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: finalContent } : m)));
      }

      if (finalContent) {
        const { data: inserted } = await supabase.from("messages").insert([
          { user_id: session.user.id, conversation_id: threadId, role: "user", content: text },
          {
            user_id: session.user.id,
            conversation_id: threadId,
            role: "assistant",
            content: finalContent,
            /* Only recorded reads travel with the answer. No reads, no claim. */
            ...(readLines.length ? { metadata: { reads: readLines } } : {}),
          },
        ]).select("id");
        if (inserted) {
          const { generateEmbedding } = await import("@/lib/embeddings");
          inserted.forEach((m) => generateEmbedding("message", m.id));
        }
        await noteActivity(threadId, firstTurn ? text : undefined);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        aborted = true;
        const finalContent = assistantSoFar ? `${assistantSoFar}\n\n_Stopped._` : "_Stopped._";
        write((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: finalContent } : m)));
        try {
          await supabase.from("messages").insert([
            { user_id: session.user.id, conversation_id: threadId, role: "user", content: text },
            { user_id: session.user.id, conversation_id: threadId, role: "assistant", content: finalContent },
          ]);
        } catch { /* noop */ }
      } else {
        toast.fromError(e);
      }
    } finally {
      endAskStream(threadId);
      if (hints.length) attachRef.current?.clearCompleted();
    }
  }, [session, scope, activeId, active, ensureThread, noteActivity, internalIntent]);

  return { send };
}
