// Project Inbox — "Suggested for this project".
// Lightweight match against recent items in the project's scope. Tap Attach
// to add it. Tap Ignore to dismiss forever (reversible via Show ignored).
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  attachToProject,
  type Project,
  type ProjectItem,
} from "@/lib/projects";
import {
  dismissSuggestion,
  listDismissed,
  loadProjectSuggestions,
  restoreDismissed,
  type SuggestedItem,
} from "@/lib/projectSuggestions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronRight, FileText, Inbox, Loader2, MessageSquare,
  Notebook, Paperclip, RotateCcw, Sparkles, X, CheckSquare, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Props {
  project: Project;
  attached: ProjectItem[];
  /** Called after a successful attach so the parent can refresh attached items. */
  onAttached: (item: SuggestedItem) => void;
}

const TYPE_META: Record<
  SuggestedItem["type"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  note: { label: "Note", icon: Notebook },
  capture: { label: "Capture", icon: MessageSquare },
  file: { label: "File", icon: Paperclip },
  commitment: { label: "Commitment", icon: CheckSquare },
  action: { label: "Action", icon: ScrollText },
};

export function ProjectInbox({ project, attached, onAttached }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<SuggestedItem[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);

  const refresh = useCallback(async () => {
    setItems(null);
    try {
      const next = await loadProjectSuggestions({ project, attached });
      setItems(next);
    } catch (err) {
      console.error("[project-inbox] load failed", err);
      setItems([]);
    }
  }, [project, attached]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleAttach(s: SuggestedItem) {
    if (!user) return;
    const key = `${s.type}:${s.id}`;
    setBusyKey(key);
    try {
      await attachToProject({
        projectId: project.id,
        userId: user.id,
        items: [{ type: s.type, id: s.id }],
      });
      setItems((cur) => (cur ? cur.filter((it) => `${it.type}:${it.id}` !== key) : cur));
      onAttached(s);
      toast.success("Attached");
    } catch (err) {
      console.error("[project-inbox] attach failed", err);
      toast.error("Couldn't attach");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleIgnore(s: SuggestedItem) {
    if (!user) return;
    const key = `${s.type}:${s.id}`;
    setBusyKey(key);
    try {
      await dismissSuggestion({
        projectId: project.id,
        userId: user.id,
        type: s.type,
        id: s.id,
      });
      setItems((cur) => (cur ? cur.filter((it) => `${it.type}:${it.id}` !== key) : cur));
    } catch (err) {
      console.error("[project-inbox] dismiss failed", err);
      toast.error("Couldn't ignore");
    } finally {
      setBusyKey(null);
    }
  }

  const count = items?.length ?? 0;

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-surface-elevated">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Project Inbox</h2>
          {items === null ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : count > 0 ? (
            <Badge variant="outline" className="text-[10px]">{count}</Badge>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {items === null ? "Looking…" : count === 0 ? "Nothing new" : "Probably belong here"}
          </span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 py-3">
          {items === null ? (
            <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Looking through recent items…
            </div>
          ) : items.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Nothing new looks related. As things land in your Inbox, they'll show up here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((s) => {
                const meta = TYPE_META[s.type];
                const Icon = meta.icon;
                const key = `${s.type}:${s.id}`;
                const busy = busyKey === key;
                return (
                  <li
                    key={key}
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-2"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm">{s.label}</p>
                      {s.snippet && s.snippet !== s.label && (
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
                          {s.snippet}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => handleAttach(s)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Attach"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleIgnore(s)}
                        disabled={busy}
                        title="Ignore — won't show up here again"
                        aria-label="Ignore suggestion"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowIgnored(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Show ignored
            </button>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>
      )}

      {showIgnored && (
        <IgnoredList
          projectId={project.id}
          onClose={() => setShowIgnored(false)}
          onRestored={refresh}
        />
      )}
    </section>
  );
}

function IgnoredList({
  projectId, onClose, onRestored,
}: { projectId: string; onClose: () => void; onRestored: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDismissed>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listDismissed(projectId);
        if (!cancelled) setRows(r);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  async function restore(id: string) {
    setBusy(id);
    try {
      await restoreDismissed(id);
      setRows((cur) => cur?.filter((r) => r.id !== id) ?? cur);
      onRestored();
    } catch {
      toast.error("Couldn't restore");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-border/60 bg-background/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Ignored items
        </span>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      {rows === null ? (
        <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-2 text-center text-[11.5px] text-muted-foreground">
          Nothing's been ignored on this project.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[12px]">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.item_type}
                </span>
                <span className="ml-2 text-muted-foreground/80">
                  ignored {formatDistanceToNow(new Date(r.dismissed_at), { addSuffix: true })}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => restore(r.id)}
                disabled={busy === r.id}
              >
                {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3" /> Restore</>}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
