import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  attachToProject,
  createProject,
  listProjects,
  type Project,
  type ProjectItemType,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Check, FolderPlus, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AttachToProjectMenuProps {
  itemType: ProjectItemType;
  itemId: string;
  itemLabel?: string;
  /** Compact icon-only trigger (for tight rows) */
  variant?: "chip" | "icon";
  className?: string;
  onAttached?: (project: Project) => void;
}

export function AttachToProjectMenu({
  itemType,
  itemId,
  itemLabel,
  variant = "chip",
  className,
  onAttached,
}: AttachToProjectMenuProps) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [justAttached, setJustAttached] = useState(false);

  const flashAttached = () => {
    setJustAttached(true);
    setTimeout(() => setJustAttached(false), 1600);
  };

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setProjects(null);
      try {
        const rows = await listProjects({ userId: user.id, organizationId: orgId });
        if (!cancelled) setProjects(rows);
      } catch (err) {
        console.error("[attach] list failed", err);
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, orgId]);

  async function doAttach(p: Project) {
    if (!user) return;
    setBusyId(p.id);
    try {
      await attachToProject({
        projectId: p.id,
        userId: user.id,
        items: [{ type: itemType, id: itemId }],
      });
      toast.success(`Attached to “${p.title}”`);
      flashAttached();
      onAttached?.(p);
      setOpen(false);
    } catch (err) {
      console.error("[attach] failed", err);
      toast.error("Couldn't attach");
    } finally {
      setBusyId(null);
    }
  }

  async function doCreateAndAttach() {
    if (!user || !newTitle.trim()) return;
    setCreating(true);
    try {
      const p = await createProject({
        title: newTitle.trim(),
        summary: itemLabel ?? "",
        scope: { userId: user.id, organizationId: orgId },
      });
      await attachToProject({
        projectId: p.id,
        userId: user.id,
        items: [{ type: itemType, id: itemId }],
      });
      toast.success(`Created “${p.title}” and attached`);
      flashAttached();
      onAttached?.(p);
      setOpen(false);
      setNewTitle("");
    } catch (err) {
      console.error("[attach] create failed", err);
      toast.error("Couldn't create");
    } finally {
      setCreating(false);
    }
  }

  const filtered = (projects ?? []).filter((p) =>
    !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-foreground",
              justAttached && "text-primary",
              className,
            )}
            title="Attach to project"
            aria-label="Attach to project"
          >
            {justAttached ? (
              <Check key="ok" className="h-4 w-4 motion-confirm" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 shrink-0 snap-start whitespace-nowrap gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground",
              justAttached && "text-primary",
              className
            )}
          >
            {justAttached ? (
              <>
                <Check key="ok" className="h-3.5 w-3.5 motion-confirm" /> Attached
              </>
            ) : (
              <>
                <FolderPlus className="h-3.5 w-3.5" /> Attach
              </>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">
            Attach to project
          </div>
          {projects === null ? (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {projects.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search projects…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              )}
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No projects match.
                  </p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => doAttach(p)}
                      disabled={busyId !== null}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-elevated disabled:opacity-50"
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
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTitle.trim()) doCreateAndAttach();
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={doCreateAndAttach}
                    disabled={creating || !newTitle.trim()}
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
