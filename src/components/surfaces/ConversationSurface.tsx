import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationDock } from "@/components/shell/ConversationDock";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AnalyzeButton } from "@/components/sherlock/AnalyzeButton";

type Msg = { id?: string; role: "user" | "assistant" | "system"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vanta-converse`;

export function ConversationSurface({ onIntent }: { onIntent?: (kind: string, payload: any) => void }) {
  const { session } = useAuth();
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
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
            // text deltas
            const delta = p.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantSoFar += delta;
              setMsgs((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m)));
            }
            // tool call result (sent by our edge function as a sentinel event)
            if (p.intent) onIntent?.(p.intent.name, p.intent.args);
          } catch { /* partial */ }
        }
      }

      // persist final assistant message
      const { data: inserted } = await supabase.from("messages").insert([
        { user_id: session.user.id, conversation_id: convId, role: "user", content: text },
        { user_id: session.user.id, conversation_id: convId, role: "assistant", content: assistantSoFar },
      ]).select("id");
      // Embed both messages in the background for memory search
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

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl space-y-3">
          {msgs.length === 0 && (
            <div className="mt-12 text-center text-sm text-muted-foreground animate-fade-in">
              <p className="text-balance">
                Tell me what you're working on. Capture, ask, plan, or stage an action.
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
      <ConversationDock busy={busy} onSend={send} />
    </div>
  );
}
