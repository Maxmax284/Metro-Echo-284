// Single shared "pick a project" body — the only project picker in Metro Echo.
// AttachToProjectMenu (one item), BulkAttachToProjectMenu (many items), the
// agenda row and the Documents export presets all render this, so the list,
// search, recents, create-new row and empty copy can never drift apart again.
// It owns loading + filtering only — the caller owns what picking actually means.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { listProjects, type Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search } from "lucide-react";
import { LoadingState } from "@/components/ui/state-views";

interface Props {
  /** Small uppercase label above the list, e.g. "Attach to project". */
  heading?: string;
  /** Called when an existing project is chosen. */
  onPick: (project: Project) => void | Promise<void>;
  /** Called with a typed title when the user wants a brand-new project.
   *  Omit to hide the create row entirely (read-only pick). */
  onCreate?: (title: string) => void | Promise<void>;
  /** Project id currently being written to, so the row can show a spinner. */
  busyId?: string | null;
  creating?: boolean;
  /** Recently used project ids — surfaced first under a "Recent" heading. */
  recentIds?: string[];
  /** Show each project's summary line under its title (roomier layouts). */
  showSummary?: boolean;
  /** Always show the search field, even with a short list. */
  alwaysShowSearch?: boolean;
  autoFocusSearch?: boolean;
  /** Replaces the default copy when this workspace has no projects at all. */
  emptyHint?: ReactNode;
}

export function ProjectPickerBody({
  heading,
  onPick,
  onCreate,
  busyId,
  creating,
  recentIds,
  showSummary,
  alwaysShowSearch,
  autoFocusSearch,
  emptyHint,
}: Props) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setProjects(null);
      try {
        const rows = await listProjects({ userId: user.id, organizationId: orgId });
        if (!cancelled) setProjects(rows);
      } catch (err) {
        console.error("[project-picker] list failed", err);
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user, orgId]);

  const all = projects ?? [];
  const term = q.trim().toLowerCase();
  const filtered = term ? all.filter((p) => p.title.toLowerCase().includes(term)) : all;

  // Recents only make sense on the unfiltered list — searching means the user
  // already knows what they're after.
  const recent = useMemo(() => {
    if (term || !recentIds?.length) return [];
    const map = new Map(all.map((p) => [p.id, p]));
    return recentIds.map((id) => map.get(id)).filter((p): p is Project => !!p).slice(0, 3);
  }, [all, recentIds, term]);

  const recentSet = new Set(recent.map((p) => p.id));
  const rest = filtered.filter((p) => !recentSet.has(p.id));

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    void onCreate?.(title);
  };

  const row = (p: Project) => (
    <button
      key={p.id}
      type="button"
      onClick={() => void onPick(p)}
      disabled={busyId != null}
      className={
        showSummary
          ? "flex min-h-11 w-full items-start justify-between gap-2 rounded-md border border-border/60 bg-background p-2.5 text-left transition-colors hover:bg-surface-elevated disabled:opacity-50"
          : "flex min-h-11 w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-surface-elevated disabled:opacity-50"
      }
    >
      <span className="min-w-0">
        <span className="block truncate text-sm">{p.title}</span>
        {showSummary && p.summary && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground line-clamp-2">
            {p.summary}
          </span>
        )}
      </span>
      {busyId === p.id && <Loader2 className="ml-2 mt-1 h-3 w-3 shrink-0 animate-spin" />}
    </button>
  );

  const sectionLabel = (text: string) => (
    <div className="px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
      {text}
    </div>
  );

  return (
    <div className="space-y-2">
      {heading && (
        <div className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {heading}
        </div>
      )}

      {projects === null ? (
        <LoadingState rows={2} label="Loading projects" />
      ) : (
        <>
          {(alwaysShowSearch || all.length > 3) && all.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects…"
                className="h-9 pl-7 text-xs"
                autoFocus={autoFocusSearch}
              />
            </div>
          )}

          <div className={showSummary ? "max-h-80 space-y-3 overflow-y-auto pr-1" : "max-h-56 overflow-y-auto"}>
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {all.length === 0
                  ? emptyHint ?? "No projects here yet. Name one below and this lands in it."
                  : "Nothing matches that name."}
              </div>
            ) : (
              <>
                {recent.length > 0 && (
                  <div className="space-y-1">
                    {sectionLabel("Recent")}
                    <div className="space-y-1">{recent.map(row)}</div>
                  </div>
                )}
                {rest.length > 0 && (
                  <div className="space-y-1">
                    {recent.length > 0 && sectionLabel("All projects")}
                    <div className={showSummary ? "space-y-1" : ""}>{rest.map(row)}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {onCreate && (
            <div className="border-t border-border/60 pt-2">
              <div className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Or create new
              </div>
              <div className="mt-1 flex gap-1">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="New project title"
                  className="h-9 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                  }}
                />
                <Button
                  size="sm"
                  className="h-9 w-11 shrink-0 px-0"
                  onClick={submitCreate}
                  disabled={creating || !newTitle.trim()}
                  aria-label="Create project and attach"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

