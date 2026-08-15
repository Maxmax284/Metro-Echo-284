// Single shared "pick a project" popover body.
// AttachToProjectMenu (one item) and BulkAttachToProjectMenu (many items) both
// render this so the list, search, create-new row and empty copy can never
// drift apart again. It owns loading + filtering only — the caller owns what
// attaching actually means.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { listProjects, type Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search } from "lucide-react";
import { InlineLoading } from "@/components/ui/state-views";

interface Props {
  /** Small uppercase label above the list, e.g. "Attach to project". */
  heading: string;
  /** Called when an existing project is chosen. */
  onPick: (project: Project) => void | Promise<void>;
  /** Called with a typed title when the user wants a brand-new project. */
  onCreate: (title: string) => void | Promise<void>;
  /** Project id currently being written to, so the row can show a spinner. */
  busyId?: string | null;
  creating?: boolean;
}

export function ProjectPickerBody({
  heading,
  onPick,
  onCreate,
  busyId,
  creating,
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

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    void onCreate(title);
  };

  return (
    <div className="space-y-2">
      <div className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {heading}
      </div>

      {projects === null ? (
        <InlineLoading label="Loading projects" className="h-20" />
      ) : (
        <>
          {all.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects…"
                className="h-9 pl-7 text-xs"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {all.length === 0
                  ? "No projects here yet. Name one below and this lands in it."
                  : "Nothing matches that name."}
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void onPick(p)}
                  disabled={busyId != null}
                  className="flex min-h-11 w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-surface-elevated disabled:opacity-50"
                >
                  <span className="truncate">{p.title}</span>
                  {busyId === p.id && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
                </button>
              ))
            )}
          </div>

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
        </>
      )}
    </div>
  );
}
