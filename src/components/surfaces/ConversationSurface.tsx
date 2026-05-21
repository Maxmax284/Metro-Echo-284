import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationDock } from "@/components/shell/ConversationDock";
import { Loader2, CheckSquare, ListPlus, BookmarkPlus, ArrowUpRight } from "lucide-react";
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
import { StagedFileChips } from "@/components/files/StagedFileChips";
import { FileAftermathTray } from "@/components/files/FileAftermathTray";

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

const RECEIPT_META: Record<IntentAck["kind"], { label: string; icon: typeof CheckSquare; surface: string }> = {
  stage_action: { label: "Drafted action", icon: ListPlus, surface: "actions" },
  add_commitment: { label: "Commitment staged", icon: CheckSquare, surface: "commitments" },
  capture_note: { label: "Saved to memory", icon: BookmarkPlus, surface: "memory" },
};

export function ConversationSurface({ onIntent, readOnly = false }: { onIntent?: (kind: string, payload: any) => void; readOnly?: boolean }) {
  const { session, user } = useAuth();
  const { context, setContext } = useCurrentContext();
  const { place } = useAwareness();
  const { mode } = useMode();
  const isOwner = useIsOwner();
  const { controls } = useSystemControls();
  const { openSherlock } = useSherlock();
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Internal intent handler — emits inline receipt cards on successful drafts.
  const internalIntent = useIntentHandler((ack) => {
    const meta = RECEIPT_META[ack.kind];
    if (!meta) return;
    setMsgs((prev) => [
      ...prev,
      {
        role: "system",
        content: ack.summary,
        receipt: { kind: ack.kind, summary: ack.summary, surface: meta.surface },
      },
    ]);
  });

  // Load or create conversation
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        setConvId(data.id);
        const { data: m } = await supabase
          .from("messages")
          .select("id, role, content, metadata")
          .eq("conversation_id", data.id)
          .order("created_at", { ascending: true })
          .limit(200);
        setMsgs((m ?? []).filter((x) => x.role !== "system" && x.role !== "tool") as any);
      } else {
        const { data: c } = await supabase
          .from("conversations")
          .insert({ user_id: session.user.id, title: "New thread" })
          .select("id")
          .single();
        setConvId(c?.id ?? null);
      }
    })();
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const send = async (text: string) => {
    if (!session || !convId) return;
    setMsgs((p) => [...p, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let aborted = false;
    let assistantSoFar = "";
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: convId, message: text }),
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
              setMsgs((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m)));
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
        setMsgs((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: finalContent } : m)));
      }

      if (finalContent) {
        const { data: inserted } = await supabase.from("messages").insert([
          { user_id: session.user.id, conversation_id: convId, role: "user", content: text },
          { user_id: session.user.id, conversation_id: convId, role: "assistant", content: finalContent },
        ]).select("id");
        if (inserted) {
          const { generateEmbedding } = await import("@/lib/embeddings");
          inserted.forEach((m) => generateEmbedding("message", m.id));
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        aborted = true;
        const finalContent = assistantSoFar ? `${assistantSoFar}\n\n_Stopped._` : "_Stopped._";
        setMsgs((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: finalContent } : m)));
        try {
          await supabase.from("messages").insert([
            { user_id: session.user.id, conversation_id: convId, role: "user", content: text },
            { user_id: session.user.id, conversation_id: convId, role: "assistant", content: finalContent },
          ]);
        } catch { /* noop */ }
      } else {
        toast.fromError(e);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

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
    const ids = SUGGESTIONS_BY_SURFACE[context.surface] ?? SUGGESTIONS_BY_SURFACE.conversation;
    const picked: Tool[] = [];
    for (const id of ids) {
      const t = COMPANION_TOOLS.find((x) => x.id === id);
      if (!t) continue;
      const avail = getToolAvailability(t, { surface: context.surface, mode, isOwner, controls });
      if (avail.available) picked.push(t);
      if (picked.length >= 3) break;
    }
    return picked;
  }, [context.surface, mode, isOwner, controls]);

  const surfaceHint = SURFACE_HINTS[context.surface] ?? SURFACE_HINTS.conversation;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/40 bg-surface-elevated/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">Capture Log.</span>{" "}
        Capture only — nothing here executes. Approvals live in Actions.
      </div>
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-32 pt-2 md:pb-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {msgs.length === 0 && (
            <div className="mt-10 space-y-4 animate-fade-in">
              <p className="text-balance text-center text-sm text-muted-foreground">
                {surfaceHint}
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
                      "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
                      m.role === "user"
                        ? "ml-auto bg-primary/10 text-foreground ring-1 ring-primary/20"
                        : "mr-auto surface-elevated text-foreground/95 ring-1 ring-border/60"
                    )}
                  >
                    {m.content || (streaming && i === msgs.length - 1 ? <Loader2 className="h-4 w-4 animate-spin opacity-60" /> : "")}
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
          surface={context.surface}
          mode={mode}
          isOwner={isOwner}
          controls={controls}
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
