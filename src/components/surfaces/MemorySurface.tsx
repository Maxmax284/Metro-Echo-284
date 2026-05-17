import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Plus, Sparkles, Loader2, X, Search, Link2, Check, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { generateEmbedding } from "@/lib/embeddings";

type HitKind = "note" | "message" | "commitment";
const HIT_KINDS: { id: HitKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "message", label: "Messages" },
  { id: "commitment", label: "Commitments" },
];

type Note = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  updated_at: string;
};

type SearchHit = {
  kind: "note" | "message" | "commitment";
  id: string;
  title: string | null;
  snippet: string;
  similarity: number;
};

type RelatedHit = { id: string; title: string | null; snippet: string; similarity: number };

export function MemorySurface() {
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [aiBusy, setAiBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [hitFilter, setHitFilter] = useState<HitKind | "all">("all");

  const [related, setRelated] = useState<RelatedHit[]>([]);
  const [relatedBusy, setRelatedBusy] = useState(false);

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
      generateEmbedding("note", (data as Note).id);
    }
  };

  const save = async (n: Note) => {
    await supabase.from("notes").update({ title: n.title, body: n.body, tags: n.tags }).eq("id", n.id);
    generateEmbedding("note", n.id);
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

  const runSearch = async () => {
    if (!query.trim()) { setHits(null); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("memory-search", {
        body: { query: query.trim(), match_count: 15, min_similarity: 0.35 },
      });
      if (error) throw error;
      setHits((data?.results ?? []) as SearchHit[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const loadRelated = async (noteId: string) => {
    setRelatedBusy(true);
    setRelated([]);
    try {
      const { data, error } = await supabase.functions.invoke("memory-autolink", {
        body: { note_id: noteId, match_count: 6, min_similarity: 0.5 },
      });
      if (error) throw error;
      setRelated((data?.suggestions ?? []) as RelatedHit[]);
    } catch {
      // swallow — usually means no embedding yet
    } finally {
      setRelatedBusy(false);
    }
  };

  const acceptLink = async (toNote: string) => {
    if (!active) return;
    try {
      await supabase.functions.invoke("memory-autolink", {
        body: { note_id: active.id, accept_ids: [toNote] },
      });
      setRelated((p) => p.filter((r) => r.id !== toNote));
      toast.success("Linked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    }
  };

  useEffect(() => {
    if (active) loadRelated(active.id);
    else setRelated([]);
  }, [active?.id]);

  const openHit = async (h: SearchHit) => {
    if (h.kind !== "note") return;
    const { data } = await supabase.from("notes").select("id, title, body, tags, updated_at").eq("id", h.id).maybeSingle();
    if (data) setActive(data as Note);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Memory</h2>
          <p className="text-xs text-muted-foreground">Search the substrate. Capture, connect, recall.</p>
        </div>
        <Button size="sm" onClick={() => setComposing(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Semantic search across notes, messages, commitments…"
            className="pl-8 pr-20"
          />
          <Button
            size="sm"
            variant="secondary"
            className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
            disabled={searching || !query.trim()}
            onClick={runSearch}
          >
            {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Search"}
          </Button>
        </div>
        {hits !== null && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{hits.length} results</span>
            <button onClick={() => { setHits(null); setQuery(""); }} className="hover:text-foreground">Clear</button>
          </div>
        )}
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
        {hits !== null ? (
          hits.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No matches. Try different wording.</div>
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={`${h.kind}:${h.id}`}>
                  <button
                    onClick={() => openHit(h)}
                    className="block w-full rounded-xl surface-elevated p-3 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-primary/80">{h.kind}</span>
                      <span className="shrink-0 text-[10.5px] text-muted-foreground">{Math.round(h.similarity * 100)}%</span>
                    </div>
                    {h.title && <h3 className="mt-1 truncate text-sm font-medium">{h.title}</h3>}
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{h.snippet}</p>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
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
              rows={8}
              value={active.body}
              onChange={(e) => setActive({ ...active, body: e.target.value })}
            />

            <div className="mt-3 rounded-lg ring-1 ring-border/60 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Link2 className="h-3 w-3" /> Related
                {relatedBusy && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              {related.length === 0 && !relatedBusy ? (
                <p className="text-[11.5px] text-muted-foreground">No suggestions yet. Save the note to generate an embedding.</p>
              ) : (
                <ul className="space-y-1.5">
                  {related.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-elevated/50 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium">{r.title || "Untitled"}</p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">{r.snippet}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{Math.round(r.similarity * 100)}%</span>
                        <button onClick={() => acceptLink(r.id)} className="rounded-md p-1 text-primary hover:bg-primary/10" title="Link">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
