import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationDock } from "@/components/shell/ConversationDock";
import { CheckSquare, ListPlus, BookmarkPlus, ArrowUpRight, Eye } from "lucide-react";
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
import { LookAtSheet } from "@/components/ask/LookAtSheet";
import { WhyThis } from "@/components/ask/WhyThis";
import { ThreadNav, ThreadJump } from "@/components/ask/ThreadNav";
import { coldOffer, markSeen } from "@/lib/threadShelf";

import { attachmentHints, processingLabel, type AttachmentHint } from "@/lib/askCapabilities";
import { CrossRefChip, readableForCrossRef } from "@/components/crossref/CrossRefChip";

import { AskContextStrip } from "@/components/ask/AskContextStrip";
import { AskEnvironmentEdge } from "@/components/ask/AskEnvironmentEdge";
import { AskDestinationsNote } from "@/components/ask/AskDestinationsNote";
import { FileAftermathTray } from "@/components/files/FileAftermathTray";
import { StructuredResponse } from "@/components/companion/StructuredResponse";
import { ProcessingLine } from "@/components/companion/ProcessingLine";

import { useScope } from "@/hooks/useScope";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useAskSuggestions } from "@/hooks/useAskSuggestions";
import { useHandoffTrace } from "@/hooks/useHandoffTrace";
import {
  getAskSession, subscribeAskSession, setAskMessages, setAskDraft,
  beginAskStream, endAskStream, stopAskStream, adoptAskSession,
  type AskSession,
} from "@/lib/askSession";


import { useAskTurn, type AskMsg as Msg } from "@/hooks/useAskTurn";
import { RECEIPT_META } from "@/lib/askReceipts";



const SURFACE_HINTS: Record<string, string> = {
  awareness: "I can explain what is around you or prepare a next step.",
  actions: "I can talk through something waiting on you or prepare a new step.",
  commitments: "I can help with a promise or tell you what is due.",
  memory: "I can capture a note, find related items, or translate something.",
  sherlock: "I can open a scoped investigation or summarize what's on screen.",
  audit: "I can explain what happened or sum up recent changes.",
  command: "I can read your current place, sum up the view, or prepare a next step.",
  conversation: "Ask naturally. Add a file, photo, or voice note when it helps.",
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


export function ConversationSurface({ readOnly = false }: { readOnly?: boolean }) {
  const { session } = useAuth();
  const { scope } = useScope();
  const { context, setContext } = useCurrentContext();
  const { place } = useAwareness();
  const { mode } = useMode();
  const isOwner = useIsOwner();
  const { controls } = useSystemControls();
  const { openSherlock } = useSherlock();
  const { activeId: convId, active: activeThread, ensureThread, noteActivity, recordOutput, newThread } = useAskThreads();
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

  // Staged file flow — capture is deliberate. No auto AI on attach.
  const [trays, setTrays] = useState<string[]>([]);
  const stagedUpload = useStagedUpload({
    source: "conversation",
    onSaved: (s) => {
      if (s.ingestedFileId) {
        setTrays((prev) => (prev.includes(s.ingestedFileId!) ? prev : [s.ingestedFileId!, ...prev]).slice(0, 3));
      }
    },
  });

  // One turn engine for every Ask body, including the inline heads-up reply.
  const { send } = useAskTurn({ attachments: stagedUpload });


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

  // Reading a thread is what clears its unread mark. Nothing else does.
  useEffect(() => {
    if (convId && msgs.length) markSeen(convId);
  }, [convId, msgs.length]);

  // A situation that has been quiet long enough deserves a deliberate choice
  // rather than an accidental continuation.
  const cold = useMemo(
    () => (msgs.length ? coldOffer(activeThread?.last_message_at) : null),
    [msgs.length, activeThread?.last_message_at],
  );


  const handleStop = () => {
    if (convId) stopAskStream(convId);
  };

  const [dropping, setDropping] = useState(false);




  // What Echo is honestly reading this turn — the label follows the attachment,
  // never a generic "thinking".
  const readingLabel = processingLabel(
    "reading",
    attachmentHints(stagedUpload.staged.map((f) => ({ name: f.file.name, type: f.file.type }))),
  );

  // Conversation attach → just stage. User must press Ingest.
  const handleAttach = (files: FileList) => {
    stagedUpload.stage(files);
  };

  // The deliberate camera seam. Closed until the user opens it.
  const [looking, setLooking] = useState(false);

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

  const liveAsks = useAskSuggestions();

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
      {cold && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/15 px-4 py-2 text-[11.5px] text-muted-foreground">
          <span className="min-w-0">
            This situation has been quiet for {cold.quietFor}.
          </span>
          <button
            type="button"
            onClick={() => void newThread()}
            className="vanta-focus rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-foreground/85 hover:bg-surface-elevated"
          >
            Start fresh
          </button>
          <span className="text-muted-foreground/70">or keep writing to continue it.</span>
        </div>
      )}
      <ThreadNav msgs={msgs} scrollRef={scrollRef} />
      <div className="relative flex min-h-0 flex-1 flex-col">
      <ThreadJump scrollRef={scrollRef} deps={msgs.length} />
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-32 pt-2 md:pb-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* The banner rides the stream: what this thread is bound to and
              where you are scroll away with the messages instead of squatting
              on the cramped keyboard view. One scroll up brings them back. */}
          <AskContextStrip className="rounded-lg border border-border/40" />
          <AskEnvironmentEdge className="rounded-lg border border-border/40" />
          <div className="rounded-lg border border-border/40 bg-surface-elevated/30 px-4 py-2 text-[11px] text-muted-foreground">
            Echo can prepare the work here. You still approve anything that acts.
          </div>
          {msgs.length === 0 && (
            <div className="mt-10 space-y-4 motion-fade">
              <p className="text-balance text-center text-sm text-muted-foreground">
                {activeThread?.context_label
                  ? <>About <span className="font-medium text-foreground/85">{activeThread.context_label}</span>. {surfaceHint}</>
                  : surfaceHint}
              </p>
              {/* Live questions, derived from real records only. They vanish
                  when the record behind them is gone. */}
              {liveAsks.length > 0 && !readOnly && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {liveAsks.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(s.question)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] text-foreground/90 transition-colors hover:bg-primary/15 disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
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
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.receipt) {
              const meta = RECEIPT_META[m.receipt.kind];
              const Icon = meta.icon;
              return (
                <div key={i} id={`ask-msg-${i}`} className="flex motion-fade">
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
            const isEcho = m.role === "assistant";
            return (
              <div key={i} id={`ask-msg-${i}`} className="group/msg flex flex-col gap-0.5">
                <div className="flex w-full items-start gap-1.5 motion-fade">
                  {/* Echo does not speak in a bubble. It speaks off a painted
                      left edge — the wall, not a chat app — but on a solid card,
                      so a long answer never fights the artwork behind it. The
                      user's own words stay a bubble on the right so the two are
                      never confused. */}
                  <div
                    className={cn(
                      "text-[15px] leading-relaxed",
                      isEcho
                        ? "mr-auto max-w-[92%] rounded-xl border-l-2 border-primary/45 bg-surface-elevated/85 px-3.5 py-2.5 ring-1 ring-border/70 text-foreground/95"
                        : "ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl bg-primary/20 px-3.5 py-2 text-foreground ring-1 ring-primary/30"
                    )}
                  >
                    {isEcho && (
                      <span className="vanta-machine-label mb-1 block text-primary/70">Echo</span>
                    )}
                    {isEcho
                      ? (m.content
                          ? <StructuredResponse text={m.content} />
                          : (streaming && i === msgs.length - 1 ? <ProcessingLine phase="reading" label={readingLabel} /> : ""))
                      : (m.content || (streaming && i === msgs.length - 1 ? <ProcessingLine phase="reading" label={readingLabel} /> : ""))}
                    {/* Writing caret: a mono block that sits at the end of the
                        answer while tokens are still arriving, then vanishes.
                        The only tell that the text is not final yet. */}
                    {isEcho && m.content && streaming && i === msgs.length - 1 && (
                      <span aria-hidden className="vanta-caret ml-0.5 align-[-1px] motion-reduce:animate-none" />
                    )}
                    {/* What Echo read before it wrote. Recorded reads only. */}
                    {isEcho && m.content && !(streaming && i === msgs.length - 1) && (
                      <WhyThis reads={m.metadata?.reads} />
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
          onLook={() => setLooking(true)}
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

                    {readableForCrossRef(
                      stagedUpload.staged.map((f) => ({ name: f.file.name, type: f.file.type })),
                    ) >= 2 && (
                      <CrossRefChip
                        sources={stagedUpload.staged.map((f) => ({
                          name: f.file.name,
                          ingestedFileId: f.ingestedFileId,
                        }))}
                        threadId={convId}
                        requestText={askSession.draft}
                      />
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

      <LookAtSheetBridge open={looking} onOpenChange={setLooking} />

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
  const { prefill, setPrefill, prefillSend } = useCompanion();
  return (
    <ConversationDock
      {...props}
      initialText={prefill}
      initialTextSubmit={prefillSend}
      onInitialTextConsumed={() => setPrefill(null)}
    />
  );
}

// The camera seam lives here so its answer can prefill the composer without
// ever sending anything on the user's behalf.
function LookAtSheetBridge({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { setPrefill } = useCompanion();
  return <LookAtSheet open={open} onOpenChange={onOpenChange} onAskAbout={(q) => setPrefill(q)} />;
}
