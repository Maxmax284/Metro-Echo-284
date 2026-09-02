import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationDock } from "@/components/shell/ConversationDock";
import { CheckSquare, ListPlus, BookmarkPlus, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { AnalyzeButton } from "@/components/sherlock/AnalyzeButton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useMode } from "@/hooks/useMode";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { COMPANION_TOOLS, getToolAvailability, type Tool } from "@/lib/companionTools";
import { useCompanion } from "@/components/companion/CompanionContext";
import { useIntentHandler, type IntentAck } from "@/hooks/useIntentHandler";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { AttachmentStrip } from "@/components/ask/AttachmentStrip";
import { attachmentHints, processingLabel, type AttachmentHint } from "@/lib/askCapabilities";

import { AskContextStrip } from "@/components/ask/AskContextStrip";
import { AskDestinationsNote } from "@/components/ask/AskDestinationsNote";
import { FileAftermathTray } from "@/components/files/FileAftermathTray";
import { StructuredResponse } from "@/components/companion/StructuredResponse";
import { ProcessingLine } from "@/components/companion/ProcessingLine";

import { useScope } from "@/hooks/useScope";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useHandoffTrace } from "@/hooks/useHandoffTrace";
import {
  getAskSession, subscribeAskSession, setAskMessages, setAskDraft,
  beginAskStream, endAskStream, stopAskStream,
  type AskSession,
} from "@/lib/askSession";



type Receipt = { kind: IntentAck["kind"]; summary: string; surface: string };
type Msg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  receipt?: Receipt;
  metadata?: { source?: string; detected_type?: string; routed_to?: string; needs_review?: boolean } | null;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vanta-converse`;


const SURFACE_HINTS: Record<string, string> = {
  awareness: "I can read your radar, explain a layer, or stage a draft from a signal.",
  actions: "I can walk you through a draft before approval, or propose a new one.",
  commitments: "I can stage a commitment from this thread or surface what's due.",
  memory: "I can capture a note, find related items, or translate something.",
  sherlock: "I can open a scoped investigation or summarize what's on screen.",
  audit: "I can explain the latest draft or summarize recent events.",
  command: "I can read your current place, summarize the view, or draft an action.",
  conversation: "Type, attach, or hit / for tools. Drafts only — nothing executes.",
};

const SUGGESTIONS_BY_SURFACE: Record<string, string[]> = {
  awareness: ["area", "summarize-page", "save-memory"],
  actions: ["draft", "draft-action", "create-commitment"],
  commitments: ["create-commitment", "related", "summarize-page"],
  memory: ["save-memory", "translate", "related"],
  sherlock: ["run-sherlock", "related", "summarize-page"],
  audit: ["draft", "summarize-page", "related"],
  command: ["area", "summarize-page", "related"],
  conversation: ["area", "save-memory", "draft-action"],
};

/* When a thread is bound to a record, the chips key off the binding, not the
   room — "ask about this project" beats "you're standing in Work". */
const SUGGESTIONS_BY_KIND: Record<string, string[]> = {
  project: ["related", "summarize-page", "create-commitment"],
  document: ["summarize-page", "save-memory", "related"],
  receipt: ["summarize-page", "related", "draft"],
  today: ["area", "create-commitment", "summarize-page"],
  calendar: ["summarize-page", "create-commitment", "related"],
  commitment: ["related", "summarize-page", "draft-action"],
  action: ["draft-action", "related", "summarize-page"],
  sherlock: ["run-sherlock", "related", "summarize-page"],
  note: ["save-memory", "related", "translate"],
  mail: ["summarize-page", "save-memory", "related"],
};

const RECEIPT_META: Record<IntentAck["kind"], { label: string; icon: typeof CheckSquare; surface: string }> = {
  stage_action: { label: "Drafted action", icon: ListPlus, surface: "actions" },
  add_commitment: { label: "Commitment staged", icon: CheckSquare, surface: "commitments" },
  capture_note: { label: "Saved to memory", icon: BookmarkPlus, surface: "memory" },
  mark_waiting: { label: "Marked as waiting", icon: CheckSquare, surface: "commitments" },
  record_decision: { label: "Decision logged", icon: BookmarkPlus, surface: "memory" },
  save_artifact: { label: "Artifact saved", icon: BookmarkPlus, surface: "memory" },
};

export function ConversationSurface({ onIntent, readOnly = false }: { onIntent?: (kind: string, payload: any) => void; readOnly?: boolean }) {
  const { session } = useAuth();
  const { scope } = useScope();
  const { context, setContext } = useCurrentContext();
  const { place } = useAwareness();
  const { mode } = useMode();
  const isOwner = useIsOwner();
  const { controls } = useSystemControls();
  const { openSherlock } = useSherlock();
  const { activeId: convId, active: activeThread, ensureThread, noteActivity, recordOutput } = useAskThreads();
  // A thread leaves a pointer, not a permission: the next device can offer to
  // reopen where the thinking stopped. Nothing about approval travels with it.
  const trace = useHandoffTrace();
  useEffect(() => {
    if (!activeThread) return;
    void trace({
      step: `was reading ${activeThread.title ?? "an Ask thread"}`,
      label: activeThread.title ?? "Ask thread",
      surface: "ask",
      threadId: activeThread.id,
    });
  }, [activeThread?.id, activeThread?.title]);
  // Wave 4 — the live half of a thread lives in the shared Ask session, not in
  // this component. Quick Ask and the Ask room mount the same session, so a
  // turn in flight and a half-typed line survive moving between them.
  const [askSession, setAskSession] = useState<AskSession>(() => getAskSession(convId ?? "_none"));
  useEffect(() => {
    const key = convId ?? "_none";
    setAskSession(getAskSession(key));
    return subscribeAskSession(key, setAskSession);
  }, [convId]);
  const msgs = askSession.messages as Msg[];
  const streaming = askSession.streaming;
  const busy = streaming;
  const setMsgs = (update: Msg[] | ((prev: Msg[]) => Msg[])) => {
    setAskMessages(convId ?? "_none", update as never);
  };
  const [researchOpen, setResearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // send() runs before the staged-upload hook is declared below, so it reads
  // the live upload controller through this mirror.
  const stagedUploadRef = useRef<ReturnType<typeof useStagedUpload> | null>(null);



  // Internal intent handler — emits inline receipt cards on successful drafts.
  const internalIntent = useIntentHandler((ack) => {
    const meta = RECEIPT_META[ack.kind];
    if (!meta) return;
    // Threads remember their aftermath, so the spine can say what came of them.
    if (convId) {
      const outKind = ack.kind === "stage_action" ? "draft" : ack.kind === "add_commitment" ? "commitment" : "note";
      void recordOutput(convId, outKind);
    }
    setMsgs((prev) => [
      ...prev,
      {
        role: "system",
        content: ack.summary,
        receipt: { kind: ack.kind, summary: ack.summary, surface: meta.surface },
      },
    ]);
  });

  // Thread selection lives in the shared engine; this surface only loads turns.
  useEffect(() => {
    if (!session || !convId) return;
    // A live turn or an already-loaded transcript is authoritative — never
    // clobber it with a refetch when a surface remounts.
    if (askSession.hydrated || askSession.streaming) return;
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase
        .from("messages")
        .select("id, role, content, metadata")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled) {
        setAskMessages(
          convId,
          // Bridge captures are inbox material, not chat turns. They belong in
          // the Capture Log with their operational card, never as a bubble here.
          (m ?? []).filter(
            (x) =>
              x.role !== "system" &&
              x.role !== "tool" &&
              !(x.metadata as { signal_only?: boolean } | null)?.signal_only,
          ) as never,
          { hydrated: true },
        );
      }
    })();
    return () => { cancelled = true; };
  }, [session, convId, askSession.hydrated, askSession.streaming]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const send = async (text: string) => {
    if (!session) return;
    const threadId = convId ?? (await ensureThread());
    if (!threadId) return;
    const firstTurn = msgs.length === 0;
    const write = (u: (prev: Msg[]) => Msg[]) => setAskMessages(threadId, u as never, { hydrated: true });
    write((p) => [...p, { role: "user", content: text }, { role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    beginAskStream(threadId, ctrl);
    let aborted = false;
    let assistantSoFar = "";
    let hints: AttachmentHint[] = [];
    try {
      // Wave 3 — anything staged travels with this turn. Files are ingested
      // first (bytes go through the file pipeline), then Ask is told what it
      // is looking at: kind, name, and whether it can be read at all.

      if (stagedUploadRef.current?.staged.length) {
        const settled = await stagedUploadRef.current.commitAll();
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
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const delta = p.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantSoFar += delta;
              write((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m)));
            }
            if (p.intent) {
              onIntent?.(p.intent.name, p.intent.args);
              void internalIntent(p.intent.name, p.intent.args);
            }
          } catch { /* partial */ }
        }
      }

      const finalContent = aborted && assistantSoFar
        ? `${assistantSoFar}\n\n_Stopped._`
        : assistantSoFar;
      if (aborted) {
        write((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: finalContent } : m)));
      }

      if (finalContent) {
        const { data: inserted } = await supabase.from("messages").insert([
          { user_id: session.user.id, conversation_id: threadId, role: "user", content: text },
          { user_id: session.user.id, conversation_id: threadId, role: "assistant", content: finalContent },
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
      // Attachments that made it into this turn stop being "pending"; their
      // aftermath tray is where they live on.
      if (hints.length) stagedUploadRef.current?.clearCompleted();
    }

  };

  const handleStop = () => {
    if (convId) stopAskStream(convId);
  };

  // Staged file flow — capture is deliberate. No auto AI on attach.
  const [trays, setTrays] = useState<string[]>([]);
  const [dropping, setDropping] = useState(false);
  const stagedUpload = useStagedUpload({
    source: "conversation",
    onSaved: (s) => {
      if (s.ingestedFileId) {
        setTrays((prev) => (prev.includes(s.ingestedFileId!) ? prev : [s.ingestedFileId!, ...prev]).slice(0, 3));
      }
    },
  });
  stagedUploadRef.current = stagedUpload;



  // What Vanta is honestly reading this turn — the label follows the attachment,
  // never a generic "thinking".
  const readingLabel = processingLabel(
    "reading",
    attachmentHints(stagedUpload.staged.map((f) => ({ name: f.file.name, type: f.file.type }))),
  );

  // Conversation attach → just stage. User must press Ingest.
  const handleAttach = (files: FileList) => {
    stagedUpload.stage(files);
  };

  // Slash: dispatch a registry tool by id
  const handleSlashPick = (toolId: string) => {
    const tool = COMPANION_TOOLS.find((t) => t.id === toolId);
    if (!tool) return;
    if (tool.directAction === "open-sherlock") {
      openSherlock({
        entity_type: "freeform",
        title: `From ${context.surface}`,
        text: place?.label ? `Current place: ${place.label}` : undefined,
      });
      return;
    }
    if (tool.directAction === "open-research") {
      setResearchOpen(true);
      return;
    }
    if (tool.buildPrompt && !busy) {
      void send(tool.buildPrompt({ surface: context.surface, placeLabel: place?.label }));
    }
  };

  const suggestions = useMemo<Tool[]>(() => {
    const kindIds = activeThread?.context_kind
      ? SUGGESTIONS_BY_KIND[activeThread.context_kind]
      : undefined;
    const ids = kindIds ?? SUGGESTIONS_BY_SURFACE[context.surface] ?? SUGGESTIONS_BY_SURFACE.conversation;
    const picked: Tool[] = [];
    for (const id of ids) {
      const t = COMPANION_TOOLS.find((x) => x.id === id);
      if (!t) continue;
      const avail = getToolAvailability(t, { surface: context.surface, mode, isOwner, controls });
      if (avail.available) picked.push(t);
      if (picked.length >= 3) break;
    }
    return picked;
  }, [activeThread?.context_kind, context.surface, mode, isOwner, controls]);

  const surfaceHint = SURFACE_HINTS[context.surface] ?? SURFACE_HINTS.conversation;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        // Drops inside Ask belong to this thread, so they must not fall through
        // to the global staging card.
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropping(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) stagedUpload.stage(files);
      }}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-[4px] border border-dashed border-accent/60 bg-background/70 text-[11px] font-mono uppercase tracking-[0.18em] text-accent">
          Drop to attach to this thread
        </div>
      )}
      {/* What this thread is bound to — scope, kind, object. Always visible. */}
      <AskContextStrip />
      <div className="border-b border-border/40 bg-surface-elevated/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">Capture Log.</span>{" "}
        Capture only — nothing here executes. Approvals live in Actions.
        <AskDestinationsNote className="mt-1" />
      </div>
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-32 pt-2 md:pb-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {msgs.length === 0 && (
            <div className="mt-10 space-y-4 animate-fade-in">
              <p className="text-balance text-center text-sm text-muted-foreground">
                {activeThread?.context_label
                  ? <>About <span className="font-medium text-foreground/85">{activeThread.context_label}</span>. {surfaceHint}</>
                  : surfaceHint}
              </p>
              {suggestions.length > 0 && !readOnly && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {suggestions.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSlashPick(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-elevated/60 px-2.5 py-1 text-[12px] text-foreground/85 transition-colors hover:bg-surface-elevated hover:text-foreground"
                      >
                        <Icon className="h-3 w-3 text-primary/80" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-center text-[11px] text-muted-foreground/70">
                Type <span className="text-foreground/70">/</span> for tools · paperclip to attach · mic to speak
              </p>
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.receipt) {
              const meta = RECEIPT_META[m.receipt.kind];
              const Icon = meta.icon;
              return (
                <div key={i} className="flex animate-fade-in">
                  <div className="mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-foreground/90">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{meta.label}:</span>
                    <span className="truncate text-muted-foreground">{m.receipt.summary}</span>
                    <button
                      type="button"
                      onClick={() => setContext({ surface: m.receipt!.surface })}
                      className="ml-1 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
                    >
                      Open <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="group/msg flex flex-col items-end gap-0.5">
                <div className="flex w-full items-start gap-1.5 animate-fade-in">
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
                      m.role === "user"
                        ? "ml-auto whitespace-pre-wrap bg-primary/10 text-foreground ring-1 ring-primary/20"
                        : "mr-auto surface-elevated text-foreground/95 ring-1 ring-border/60"
                    )}
                  >
                    {m.role === "assistant"
                      ? (m.content
                          ? <StructuredResponse text={m.content} />
                          : (streaming && i === msgs.length - 1 ? <ProcessingLine phase="reading" label={readingLabel} /> : ""))
                      : (m.content || (streaming && i === msgs.length - 1 ? <ProcessingLine phase="reading" label={readingLabel} /> : ""))}
                    {/* Writing caret: a mono block that sits at the end of the
                        answer while tokens are still arriving, then vanishes.
                        The only tell that the text is not final yet. */}
                    {m.role === "assistant" && m.content && streaming && i === msgs.length - 1 && (
                      <span aria-hidden className="vanta-caret ml-0.5 align-[-1px] motion-reduce:animate-none" />
                    )}


                  </div>

                  {m.content && m.role !== "system" && (
                    <div className="opacity-0 transition-opacity group-hover/msg:opacity-100">
                      <AnalyzeButton
                        scope={{
                          entity_type: "message",
                          entity_id: m.id ?? null,
                          title: m.content.slice(0, 80),
                          text: m.content,
                        }}
                      />
                    </div>
                  )}
                </div>
                {m.role === "user" && m.metadata && (m.metadata.source || m.metadata.detected_type || m.metadata.routed_to) && (
                  <div className="mr-1 flex flex-wrap items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {m.metadata.source && (
                      <span className="rounded-full bg-muted/30 px-1.5 py-0.5 ring-1 ring-border/50">{m.metadata.source}</span>
                    )}
                    {m.metadata.detected_type && (
                      <span className="rounded-full bg-muted/30 px-1.5 py-0.5 ring-1 ring-border/50">{m.metadata.detected_type}</span>
                    )}
                    {m.metadata.routed_to ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary ring-1 ring-primary/30">→ {m.metadata.routed_to}</span>
                    ) : m.metadata.needs_review ? (
                      <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-warn ring-1 ring-warn/30">Needs review</span>
                    ) : (
                      <span className="rounded-full bg-muted/20 px-1.5 py-0.5 ring-1 ring-border/50">Captured</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {readOnly ? (
        <div className="safe-bottom sticky bottom-[64px] z-30 px-3 pb-2 pt-2 md:bottom-0 md:relative md:px-0 md:pb-0">
          <div className="mx-auto max-w-3xl rounded-2xl glass px-4 py-2.5 text-center text-xs text-muted-foreground">
            Read-only log. Open the companion to talk.
          </div>
        </div>
      ) : (
        <ConversationDockBridge
          busy={busy}
          onSend={send}
          onAttach={handleAttach}
          onSlashPick={handleSlashPick}
          onStop={handleStop}
          draft={askSession.draft}
          onDraftChange={(t) => setAskDraft(convId ?? "_none", t)}
          surface={context.surface}
          mode={mode}
          isOwner={isOwner}
          controls={controls}
          aboveComposer={
            (stagedUpload.staged.length > 0 || trays.length > 0) ? (
              <div className="space-y-2 rounded-2xl glass px-3 py-2 shadow-lg backdrop-blur-md">
                {stagedUpload.staged.length > 0 && (
                  <div className="space-y-2">
                    <AttachmentStrip
                      items={stagedUpload.staged}
                      onRemove={stagedUpload.remove}
                      onRetry={stagedUpload.retry}
                    />
                    {stagedUpload.staged.some((s) => s.status === "staged") && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void stagedUpload.commitAll()}
                          className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Ingest staged
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {trays.map((id) => (
                  <FileAftermathTray
                    key={id}
                    ingestedFileId={id}
                    onDismiss={() => setTrays((prev) => prev.filter((x) => x !== id))}
                  />
                ))}
              </div>
            ) : null
          }
        />
      )}

      <Sheet open={researchOpen} onOpenChange={setResearchOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="text-sm">Research</SheetTitle>
          </SheetHeader>
          <div className="p-3">
            <ResearchPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Stage 6 — bridge that wires Companion prefill into the dock.
function ConversationDockBridge(props: React.ComponentProps<typeof ConversationDock>) {
  const { prefill, setPrefill } = useCompanion();
  return (
    <ConversationDock
      {...props}
      initialText={prefill}
      onInitialTextConsumed={() => setPrefill(null)}
    />
  );
}
