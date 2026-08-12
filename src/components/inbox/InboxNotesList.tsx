import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Notebook } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/state-views";
import { formatDistanceToNow } from "date-fns";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { generateEmbedding } from "@/lib/embeddings";
import { AttachToProjectMenu } from "@/components/projects/AttachToProjectMenu";
import { BulkAttachToProjectMenu } from "@/components/projects/BulkAttachToProjectMenu";
import { SherlockFindingsChips } from "@/components/sherlock/SherlockFindingsChips";
import { ResearchSuggestionChip } from "@/components/research/ResearchSuggestionChip";

type Note = {
  id: string;
  title: string | null;
  body: string;
  updated_at: string;
};

/**
 * InboxNotesList — lightweight notes list with checkboxes + bulk attach.
 * Clicking a row opens an inline editor dialog. The richer search/AI flows
 * still live in the Memory surface (reachable via More).
 */
export function InboxNotesList() {
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Note | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setNotes(null);
    const { data } = await supabase
      .from("notes")
      .select("id, title, body, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setNotes((data ?? []) as Note[]);
  };

  useEffect(() => { if (session) refresh(); }, [session]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createNote = async () => {
    if (!session) return;
    if (!draft.body.trim() && !draft.title.trim()) {
      setComposing(false);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("notes")
        .insert({ user_id: session.user.id, title: draft.title || null, body: draft.body, tags: [] })
        .select("id, title, body, updated_at")
        .single();
      if (error) throw error;
      if (data) {
        setNotes((p) => [data as Note, ...(p ?? [])]);
        generateEmbedding("note", (data as Note).id);
      }
      setDraft({ title: "", body: "" });
      setComposing(false);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save note");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("notes")
        .update({ title: editing.title, body: editing.body })
        .eq("id", editing.id);
      if (error) throw error;
      generateEmbedding("note", editing.id);
      setEditing(null);
      refresh();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
    setNotes((p) => (p ?? []).filter((n) => n.id !== id));
    setPicked((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setEditing(null);
  };

  if (!notes) return <LoadingState rows={3} label="Loading notes" />;

  const pickedItems = Array.from(picked).map((id) => ({ type: "note" as const, id }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setComposing(true)}>
          <Plus className="h-3.5 w-3.5" /> New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={<Notebook className="h-5 w-5" />}
          title="Nothing written down yet"
          hint="Notes are the fastest way in. Anything you save here can be pushed into a project later."
          actionLabel="New note"
          onAction={() => setComposing(true)}
        />
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => {
            const isPicked = picked.has(n.id);
            return (
              <li
                key={n.id}
                className={`flex items-start gap-2 rounded-xl border border-border/60 bg-surface-elevated p-3 transition-colors ${isPicked ? "ring-1 ring-primary/40" : ""}`}
              >
                <Checkbox
                  checked={isPicked}
                  onCheckedChange={() => togglePick(n.id)}
                  className="mt-1"
                  aria-label="Select note"
                />
                <button
                  onClick={() => setEditing(n)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {n.title || (n.body.slice(0, 60) || "Untitled note")}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                  {n.title && n.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <SherlockFindingsChips
                      sourceObjectType="note"
                      sourceObjectId={n.id}
                      scope={{ entity_type: "note", entity_id: n.id, title: n.title ?? undefined, text: n.body }}
                    />
                    {n.body.trim().length >= 60 && (
                      <ResearchSuggestionChip
                        prompt={`Outside context for this note: ${(n.title || n.body).slice(0, 160)}`}
                        relatedEntityType="note"
                        relatedEntityId={n.id}
                      />
                    )}
                  </div>
                </button>
                <AttachToProjectMenu
                  itemType="note"
                  itemId={n.id}
                  itemLabel={n.title || n.body.slice(0, 80)}
                  variant="icon"
                />
              </li>
            );
          })}
        </ul>
      )}

      {picked.size > 0 && (
        <div className="sticky bottom-2 z-20 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-[11.5px] font-medium">{picked.size} selected</span>
          <div className="ml-auto flex items-center gap-1.5">
            <BulkAttachToProjectMenu
              items={pickedItems}
              onAttached={() => setPicked(new Set())}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[11px] text-muted-foreground"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* New note */}
      <Dialog open={composing} onOpenChange={(o) => { if (!o) { setComposing(false); setDraft({ title: "", body: "" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New note</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Title (optional)"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
            />
            <Textarea
              placeholder="What do you want to remember?"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setComposing(false); setDraft({ title: "", body: "" }); }}>Cancel</Button>
            <Button onClick={createNote} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit note */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit note</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-2">
              <Input
                placeholder="Title"
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <Textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={10}
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <AttachToProjectMenu
                  itemType="note"
                  itemId={editing.id}
                  itemLabel={editing.title || editing.body.slice(0, 80)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeNote(editing.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Close</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
