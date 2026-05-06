import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Plus, Sparkles, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Note = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  updated_at: string;
};

export function MemorySurface() {
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [aiBusy, setAiBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notes")
      .select("id, title, body, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setNotes((data ?? []) as Note[]);
    setLoading(false);
  };

  useEffect(() => { if (session) refresh(); }, [session]);

  const create = async () => {
    if (!session) return;
    if (!draft.body.trim() && !draft.title.trim()) return;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: session.user.id, title: draft.title || null, body: draft.body, tags: [] })
      .select("id, title, body, tags, updated_at")
      .single();
    if (data) {
      setNotes((p) => [data as Note, ...p]);
      setDraft({ title: "", body: "" });
      setComposing(false);
    }
  };

  const save = async (n: Note) => {
    await supabase.from("notes").update({ title: n.title, body: n.body, tags: n.tags }).eq("id", n.id);
    refresh();
  };

  const del = async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
    setActive(null);
    setNotes((p) => p.filter((n) => n.id !== id));
  };

  const aiAssist = async (action: "summarize" | "extract") => {
    if (!active || !session) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("notes-assist", {
        body: { action, note_id: active.id, body: active.body },
      });
      if (error) throw error;
      if (data?.appended) {
        const updated = { ...active, body: active.body + "\n\n" + data.appended };
        setActive(updated);
        await save(updated);
      }
      toast.success(action === "summarize" ? "Summary added" : "Action items extracted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI assist failed");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Memory</h2>
          <p className="text-xs text-muted-foreground">Your structured workspace.</p>
        </div>
        <Button size="sm" onClick={() => setComposing(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      {composing && (
        <div className="mx-4 mb-3 space-y-2 rounded-xl glass p-3 animate-slide-up">
          <Input
            placeholder="Title (optional)"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Textarea
            placeholder="What's on your mind?"
            rows={5}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>Cancel</Button>
            <Button size="sm" onClick={create}>Save</Button>
          </div>
        </div>
      )}

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No notes yet. Capture a thought.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => setActive(n)}
                  className="block w-full rounded-xl surface-elevated p-3 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate text-sm font-medium">{n.title || "Untitled"}</h3>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/60 backdrop-blur-sm md:items-center" onClick={() => setActive(null)}>
          <div
            className="m-0 w-full max-w-2xl rounded-t-2xl glass p-5 md:m-4 md:rounded-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit note</h3>
              <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={active.title ?? ""}
              onChange={(e) => setActive({ ...active, title: e.target.value })}
              placeholder="Title"
              className="mb-2"
            />
            <Textarea
              rows={10}
              value={active.body}
              onChange={(e) => setActive({ ...active, body: e.target.value })}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={aiBusy} onClick={() => aiAssist("summarize")} className="gap-1">
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Summarize
                </Button>
                <Button variant="secondary" size="sm" disabled={aiBusy} onClick={() => aiAssist("extract")} className="gap-1">
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Extract actions
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => del(active.id)}>Delete</Button>
                <Button size="sm" onClick={() => { save(active); setActive(null); }}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
