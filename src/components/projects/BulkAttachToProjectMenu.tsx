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
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderPlus, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface BulkAttachItem {
  type: ProjectItemType;
  id: string;
}

interface Props {
  items: BulkAttachItem[];
  disabled?: boolean;
  className?: string;
  label?: string;
  onAttached?: (project: Project, count: number) => void;
}

/**
 * BulkAttachToProjectMenu — pushes many items into one project in a single call.
 * Reuses attachToProject (batched insert + dedupe) and writes one audit event.
 */
export function BulkAttachToProjectMenu({
  items,
  disabled,
  className,
  label,
  onAttached,
}: Props) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setProjects(null);
      try {
        const rows = await listProjects({ userId: user.id, organizationId: orgId });
        if (!cancelled) setProjects(rows);
      } catch (err) {
        console.error("[bulk-attach] list failed", err);
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, orgId]);

  async function doBulkAttach(projectId: string, projectTitle: string) {
    if (!user || items.length === 0) return;
    await attachToProject({
      projectId,
      userId: user.id,
      items: items.map((it) => ({ type: it.type, id: it.id })),
    });
    // Single rolled-up audit event so receipts stay readable.
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "project",
      entity_id: projectId,
      event: "inbox.bulk_attached",
      payload: { project_id: projectId, count: items.length, items: items.map((it) => ({ type: it.type, id: it.id })) },
    });
    toast.success(`${items.length} pushed to "${projectTitle}"`);
  }

  async function pickExisting(p: Project) {
    setBusyId(p.id);
    try {
      await doBulkAttach(p.id, p.title);
      onAttached?.(p, items.length);
      setOpen(false);
    } catch (err) {
      console.error("[bulk-attach] failed", err);
      toast.error("Couldn't attach");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAttach() {
    if (!user || !newTitle.trim()) return;
    setCreating(true);
    try {
      const p = await createProject({
        title: newTitle.trim(),
        scope: { userId: user.id, organizationId: orgId },
      });
      await doBulkAttach(p.id, p.title);
      onAttached?.(p, items.length);
      setOpen(false);
      setNewTitle("");
    } catch (err) {
      console.error("[bulk-attach] create failed", err);
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
        <Button
          size="sm"
          className={cn("h-8 gap-1 text-[11.5px]", className)}
          disabled={disabled || items.length === 0}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {label ?? `Push to project${items.length ? ` (${items.length})` : ""}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="space-y-2">
          <div className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Push {items.length} item{items.length === 1 ? "" : "s"} to…
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
                    No projects yet — create one below.
                  </p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pickExisting(p)}
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
                      if (e.key === "Enter" && newTitle.trim()) createAndAttach();
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={createAndAttach}
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
