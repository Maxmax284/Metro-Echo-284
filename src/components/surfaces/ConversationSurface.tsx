import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationDock } from "@/components/shell/ConversationDock";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AnalyzeButton } from "@/components/sherlock/AnalyzeButton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useMode } from "@/hooks/useMode";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { COMPANION_TOOLS } from "@/lib/companionTools";

type Msg = { id?: string; role: "user" | "assistant" | "system"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vanta-converse`;
const MAX_BYTES = 20 * 1024 * 1024;

export function ConversationSurface({ onIntent, readOnly = false }: { onIntent?: (kind: string, payload: any) => void; readOnly?: boolean }) {
  const { session, user } = useAuth();
  const { context } = useCurrentContext();
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
          .select("id, role, content")
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

    let assistantSoFar = "";
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: convId, message: text }),
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
            if (p.intent) onIntent?.(p.intent.name, p.intent.args);
          } catch { /* partial */ }
        }
      }

      const { data: inserted } = await supabase.from("messages").insert([
        { user_id: session.user.id, conversation_id: convId, role: "user", content: text },
        { user_id: session.user.id, conversation_id: convId, role: "assistant", content: assistantSoFar },
      ]).select("id");
      if (inserted) {
        const { generateEmbedding } = await import("@/lib/embeddings");
        inserted.forEach((m) => generateEmbedding("message", m.id));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  };

  // Attach: upload file → ingest → auto-run analyze-file tool
  const handleAttach = async (files: FileList) => {
    if (!user) return;
    const list = Array.from(files);
    for (const f of list) {
      try {
        if (f.size > MAX_BYTES) { toast.error(`${f.name} exceeds 20MB`); continue; }
        const path = `${user.id}/${Date.now()}-${f.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("memory-uploads").upload(path, f, { contentType: f.type || undefined });
        if (upErr) throw upErr;
        const { data: rec, error: insErr } = await supabase
          .from("ingested_files")
          .insert({
            user_id: user.id,
            filename: f.name,
            mime_type: f.type || null,
            size_bytes: f.size,
            storage_path: path,
            source: "upload",
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        const { error: fnErr } = await supabase.functions.invoke("files-ingest", {
          body: { ingested_file_id: rec.id },
        });
        if (fnErr) throw fnErr;
        toast.success(`${f.name} ingested`);
        // Auto-run analyze-file registry tool
        const analyze = COMPANION_TOOLS.find((t) => t.id === "analyze-file");
        if (analyze?.buildPrompt && !busy) {
          void send(analyze.buildPrompt({ surface: context.surface, placeLabel: place?.label }));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
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

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-32 pt-2 md:pb-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {msgs.length === 0 && (
            <div className="mt-12 text-center text-sm text-muted-foreground animate-fade-in">
              <p className="text-balance">
                Tell me what you're working on. Type <span className="text-foreground/80">/</span> for tools, paperclip to attach, mic to speak.
              </p>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="group/msg flex items-start gap-1.5 animate-fade-in">
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
              {m.content && (
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
          ))}
        </div>
      </div>
      {readOnly ? (
        <div className="safe-bottom sticky bottom-[64px] z-30 px-3 pb-2 pt-2 md:bottom-0 md:relative md:px-0 md:pb-0">
          <div className="mx-auto max-w-3xl rounded-2xl glass px-4 py-2.5 text-center text-xs text-muted-foreground">
            Read-only log. Open the companion to talk.
          </div>
        </div>
      ) : (
        <ConversationDock
          busy={busy}
          onSend={send}
          onAttach={handleAttach}
          onSlashPick={handleSlashPick}
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
