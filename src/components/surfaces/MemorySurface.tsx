import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Plus, Sparkles, Loader2, X, Search, Link2, Check, Inbox, AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { generateEmbedding } from "@/lib/embeddings";
import { linkEntities } from "@/lib/entityGraph";
import { CorrectionsCenter } from "@/components/memory/CorrectionsCenter";
import { CapturesView } from "@/components/memory/CapturesView";
import { MemoryFilesView } from "@/components/memory/MemoryFilesView";
import { StatusDot, similarityTone } from "@/components/ui/status-dot";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { SherlockChipTrigger } from "@/components/sherlock/SherlockChipTrigger";
import { EmbeddedSherlockFindings } from "@/components/sherlock/EmbeddedSherlockFindings";
import { ConnectButton } from "@/components/links/ConnectButton";
import { LinkedChipsBar } from "@/components/links/LinkedChipsBar";
import { ManualLinkSheet } from "@/components/links/ManualLinkSheet";

const STARTER_SEARCHES = [
  "What did I commit to this week?",
  "Notes about Lisbon",
  "Recent messages on payments",
  "Anything I logged about scams",
];

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
  const { openSherlock } = useSherlock();
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [view, setView] = useState<"inbox" | "notes" | "captures" | "files" | "corrections">("inbox");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [hitFilter, setHitFilter] = useState<HitKind | "all">("all");
  const [groupBy, setGroupBy] = useState<"none" | "source">("none");
  const [deleteText, setDeleteText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const searchCancelRef = useRef(false);

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

  const auditNote = async (noteId: string, event: string, payload: Record<string, any> = {}) => {
    if (!session) return;
    await supabase.from("audit_log").insert({
      user_id: session.user.id,
      entity_type: "note",
      entity_id: noteId,
      event,
      payload,
    });
  };

  const noteToReminder = async (n: Note) => {
    if (!session) return;
    const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from("commitments").insert({
      user_id: session.user.id,
      summary: (n.title || n.body).slice(0, 200),
      due_at: due,
      remind_at: due,
      priority: "low",
      source_note: n.id,
    }).select("id").single();
    if (data) generateEmbedding("commitment", data.id);
    if (data?.id) linkEntities({ userId: session.user.id, source_kind: "commitment", source_id: data.id, text: (n.title || n.body) });
    await auditNote(n.id, "note.converted_to_reminder", { commitment_id: data?.id });
    toast.success(vantaSay.noteToReminder());
  };

  const noteToCommitment = async (n: Note) => {
    if (!session) return;
    const { data } = await supabase.from("commitments").insert({
      user_id: session.user.id,
      summary: (n.title || n.body).slice(0, 200),
      source_note: n.id,
    }).select("id").single();
    if (data) generateEmbedding("commitment", data.id);
    if (data?.id) linkEntities({ userId: session.user.id, source_kind: "commitment", source_id: data.id, text: (n.title || n.body) });
    await auditNote(n.id, "note.converted_to_commitment", { commitment_id: data?.id });
    toast.success(vantaSay.noteToCommitment());
  };

  const noteToSherlock = async (n: Note) => {
    openSherlock({ entity_type: "note", entity_id: n.id, title: n.title || "Note", text: n.body });
    await auditNote(n.id, "note.sent_to_sherlock");
  };

  const archiveNote = async (n: Note) => {
    const tags = Array.from(new Set([...(n.tags || []), "archived"]));
    await supabase.from("notes").update({ tags }).eq("id", n.id);
    await auditNote(n.id, "memory.archived");
    toast.success({ title: vantaSay.archived() });
    refresh();
  };

  const unarchiveNote = async (n: Note) => {
    const tags = (n.tags || []).filter((t) => t !== "archived");
    await supabase.from("notes").update({ tags }).eq("id", n.id);
    await auditNote(n.id, "memory.unarchived");
    toast.success({ title: vantaSay.restored() });
    refresh();
  };

  const noteToActionDraft = async (n: Note) => {
    if (!session) return;
    const { data } = await supabase.from("actions").insert({
      user_id: session.user.id,
      title: (n.title || n.body).slice(0, 120),
      description: n.body.slice(0, 1000),
      source: `note:${n.id}`,
      status: "proposed",
    }).select("id").single();
    await auditNote(n.id, "note.converted_to_action_draft", { action_id: data?.id });
    toast.success({ title: vantaSay.actionDrafted() });
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
      toast.success(action === "summarize" ? vantaSay.summarized() : vantaSay.actionsExtracted());
    } catch (e) {
      toast.fromError(e, vantaSay.aiAssistFailed());
    } finally {
      setAiBusy(false);
    }
  };

  const runSearch = async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q) { setHits(null); return; }
    if (override) setQuery(override);
    searchCancelRef.current = false;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("memory-search", {
        body: { query: q, match_count: 15, min_similarity: 0.35 },
      });
      if (searchCancelRef.current) return;
      if (error) throw error;
      setHits((data?.results ?? []) as SearchHit[]);
    } catch (e) {
      if (searchCancelRef.current) return;
      toast.fromError(e, vantaSay.searchFailed());
    } finally {
      setSearching(false);
    }
  };

  const cancelSearch = () => {
    searchCancelRef.current = true;
    setSearching(false);
    toast.message(vantaSay.cancelled("Search cancelled"));
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
      toast.success(vantaSay.linked());
    } catch (e) {
      toast.fromError(e);
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
      <div className="space-y-2 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Memory</h2>
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
              semantic
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLinking(true)}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/40 px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              title="Manually link two items"
            >
              <Link2 className="h-3 w-3" /> Link
            </button>
            {view === "notes" && (
              <>
                <button
                  type="button"
                  onClick={() => setGroupBy((g) => (g === "none" ? "source" : "none"))}
                  className={cn(
                    "rounded-full border px-2 py-1 text-[10.5px] transition-colors",
                    groupBy === "source"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                  )}
                  title="Group by source"
                >
                  {groupBy === "source" ? "Grouped" : "Group"}
                </button>
                <Button size="sm" onClick={() => setComposing(true)} className="gap-1">
                  <Plus className="h-4 w-4" /> New
                </Button>
              </>
            )}
          </div>
        </div>
        <ManualLinkSheet open={linking} onOpenChange={setLinking} />
        <div className="-mx-1 flex snap-x snap-mandatory items-center gap-1 overflow-x-auto px-1">
          {([
            { id: "inbox", label: "Inbox", Icon: HelpCircle },
            { id: "notes", label: "Notes", Icon: Inbox },
            { id: "captures", label: "Captures", Icon: Inbox },
            { id: "files", label: "Files", Icon: Inbox },
            { id: "corrections", label: "Corrections", Icon: AlertTriangle },
          ] as const).map((v) => {
            const Icon = v.Icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "corrections" ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
          <CorrectionsCenter />
        </div>
      ) : view === "files" ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
          <MemoryFilesView />
        </div>
      ) : view === "captures" || view === "inbox" ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
          <CapturesView ambiguousOnly={view === "inbox"} />
        </div>
      ) : (
      <>
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
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {searching && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={cancelSearch}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              disabled={searching || !query.trim()}
              onClick={() => runSearch()}
            >
              {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Search"}
            </Button>
          </div>
        </div>
        {hits === null && !query.trim() && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STARTER_SEARCHES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => runSearch(q)}
                className="rounded-full bg-surface-elevated/60 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-surface-elevated hover:text-foreground/90"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {hits !== null && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {HIT_KINDS.map((k) => {
              const count = k.id === "all" ? hits.length : hits.filter((h) => h.kind === k.id).length;
              return (
                <button
                  key={k.id}
                  onClick={() => setHitFilter(k.id)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] ring-1 transition-colors",
                    hitFilter === k.id
                      ? "bg-primary/15 text-primary ring-primary/40"
                      : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
                  )}
                >
                  {k.label} <span className="opacity-60">· {count}</span>
                </button>
              );
            })}
            <button
              onClick={() => { setHits(null); setQuery(""); setHitFilter("all"); }}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
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
        {hits !== null ? (() => {
          const filtered = hitFilter === "all" ? hits : hits.filter((h) => h.kind === hitFilter);
          if (filtered.length === 0) {
            return (
              <div className="rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
                <Search className="mx-auto mb-2 h-4 w-4 opacity-60" />
                {hits.length === 0
                  ? "No matches. Try different wording or broader terms."
                  : `No ${hitFilter} matches. Switch filter or broaden the query.`}
              </div>
            );
          }
          return (
            <ul className="space-y-2">
              {filtered.map((h) => (
                <li key={`${h.kind}:${h.id}`}>
                  <button
                    onClick={() => openHit(h)}
                    className="block w-full rounded-xl surface-elevated p-3 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-primary/80">{h.kind}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <StatusDot tone={similarityTone(h.similarity)} title={`${Math.round(h.similarity * 100)}% match`} />
                        {Math.round(h.similarity * 100)}%
                      </span>
                    </div>
                    {h.title && <h3 className="mt-1 truncate text-sm font-medium">{h.title}</h3>}
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{h.snippet}</p>
                  </button>
                </li>
              ))}
            </ul>
          );
        })() : loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-5 w-5 opacity-60" />
            <p>No notes yet.</p>
            <p className="mt-1 text-[11.5px]">Capture a thought with <strong>New</strong>, or search across messages and commitments above.</p>
          </div>
        ) : (() => {
          const sourceOf = (n: Note) => {
            const tag = (n.tags || []).find((t) => t.startsWith("source:"));
            if (tag) return tag.slice(7);
            if ((n.tags || []).includes("imported")) return "file";
            return "manual";
          };
          const SOURCE_CHIP: Record<string, string> = {
            telegram: "From Telegram",
            companion: "From Companion",
            file: "From a file",
            field_note: "Field note",
            manual: "Written here",
          };
          const whyMatters = (n: Note) => {
            const tags = n.tags || [];
            if (tags.includes("archived")) return "Archived.";
            const src = sourceOf(n);
            const linked = tags.some((t) => t.startsWith("link:") || t.startsWith("project:") || t.startsWith("person:") || t.startsWith("place:"));
            if (!linked && src === "manual") return "Saved, but no strong links yet.";
            if (src === "telegram") return "Captured from Telegram.";
            if (src === "companion") return "Saved from Companion.";
            if (src === "file") return "Came in from a file upload.";
            if (src === "field_note") return "Tied to a place you logged.";
            return null;
          };
          const renderItem = (n: Note) => {
            const src = sourceOf(n);
            const why = whyMatters(n);
            const archived = (n.tags || []).includes("archived");
            return (
              <li key={n.id}>
                <div className={cn("rounded-xl surface-elevated p-3 ring-1 ring-border/60", archived && "opacity-60")}>
                  <button onClick={() => setActive(n)} className="block w-full text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="truncate text-sm font-medium">{n.title || "Untitled"}</h3>
                      <span className="shrink-0 text-[10.5px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <span className="rounded-full bg-muted/30 px-2 py-0.5 ring-1 ring-border/50">{SOURCE_CHIP[src] ?? src}</span>
                      {why && <span className="italic opacity-80">{why}</span>}
                      <SherlockChipTrigger
                        operation="relate"
                        entityType="note"
                        entityId={n.id}
                        text={`${n.title ?? ""}\n${n.body ?? ""}`}
                        title={n.title ?? "Untitled"}
                        showWhenEmpty={false}
                      />
                    </div>
                  </button>
                  <EmbeddedSherlockFindings sourceType="note" sourceId={n.id} />
                  {!archived ? (
                    <div className="-mx-1 mt-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); noteToReminder(n); }}>Reminder</Button>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); noteToCommitment(n); }}>Commitment</Button>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); noteToActionDraft(n); }}>Action draft</Button>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); noteToSherlock(n); }}>Sherlock</Button>
                      <Button size="sm" variant="ghost" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px] text-muted-foreground" onClick={(e) => { e.stopPropagation(); archiveNote(n); }}>Archive</Button>
                    </div>
                  ) : (
                    <div className="-mx-1 mt-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); unarchiveNote(n); }}>Undo archive</Button>
                    </div>
                  )}
                </div>
              </li>
            );
          };
          if (groupBy === "source") {
            const sourceOf = (n: Note) => {
              const tag = (n.tags || []).find((t) => t.startsWith("source:"));
              if (tag) return tag.slice(7);
              if ((n.tags || []).includes("imported")) return "file";
              return "manual";
            };
            const SOURCE_ORDER = ["telegram", "companion", "file", "field_note", "manual"];
            const SOURCE_LABEL: Record<string, string> = {
              telegram: "From Telegram",
              companion: "From Companion",
              file: "From files",
              field_note: "From field notes",
              manual: "Written here",
            };
            const groups = new Map<string, Note[]>();
            for (const n of notes) {
              const s = sourceOf(n);
              if (!groups.has(s)) groups.set(s, []);
              groups.get(s)!.push(n);
            }
            const ordered = [...SOURCE_ORDER.filter((s) => groups.has(s)), ...[...groups.keys()].filter((s) => !SOURCE_ORDER.includes(s))];
            return (
              <div className="space-y-4">
                {ordered.map((src) => (
                  <section key={src}>
                    <h3 className="mb-1.5 px-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      {SOURCE_LABEL[src] ?? src} <span className="opacity-60">· {groups.get(src)!.length}</span>
                    </h3>
                    <ul className="space-y-2">{groups.get(src)!.map(renderItem)}</ul>
                  </section>
                ))}
              </div>
            );
          }
          return <ul className="space-y-2">{notes.map(renderItem)}</ul>;
        })()}
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

            <div className="mt-3 space-y-1.5 rounded-lg ring-1 ring-border/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Manual connections</p>
                <ConnectButton source={{ kind: "note", id: active.id, label: active.title ?? active.body.slice(0, 60) }} />
              </div>
              <LinkedChipsBar source={{ kind: "note", id: active.id }} />
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
                <Button variant="ghost" size="sm" onClick={() => { setDeleteText(""); setConfirmingDelete(true); }} className="text-destructive hover:text-destructive">Delete</Button>
                <Button size="sm" onClick={() => { save(active); setActive(null); }}>Save</Button>
              </div>
            </div>
            {confirmingDelete && (
              <div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                <p className="text-xs text-foreground">
                  Permanent. Type <span className="font-mono font-semibold">delete</span> to confirm.
                </p>
                <Input autoFocus value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="delete" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteText.trim().toLowerCase() !== "delete"}
                    onClick={() => { del(active.id); setConfirmingDelete(false); }}
                  >
                    Delete forever
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
