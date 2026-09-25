import { ProjectSticker } from "@/components/projects/ProjectSticker";
import { useCallback, useEffect, useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { Project, createProject, listProjects } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Loader2, Pin, Plus } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/state-views";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { ProjectBriefView } from "@/components/projects/ProjectBriefView";
import { DeskIntro } from "@/components/work/DeskIntro";
import { FlowRail, FLOWS } from "@/components/work/FlowRail";

/**
 * ProjectsSurface — in-shell list of projects (Living Briefs).
 * Tapping a project swaps this surface to the Living Brief view in place,
 * so everything stays under the Projects tab and the shell chrome is preserved.
 */
export function ProjectsSurface() {
  const { user } = useAuth();
  const orgId = useActiveOrgId();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listProjects({ userId: user.id, organizationId: orgId });
      setProjects(rows);
    } catch (err) {
      console.error("[projects] load failed", err);
      setProjects([]);
      toast.error("Couldn't load projects");
    }
  }, [user, orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // When switching workspaces, drop any open project that no longer belongs.
  useEffect(() => {
    if (!selectedId || !projects) return;
    if (!projects.some((p) => p.id === selectedId)) setSelectedId(null);
  }, [projects, selectedId]);

  async function handleCreate() {
    if (!user) return;
    if (!title.trim()) {
      toast.error("Give the project a title first");
      return;
    }
    setCreating(true);
    try {
      const p = await createProject({
        title,
        summary,
        scope: { userId: user.id, organizationId: orgId },
      });
      setOpen(false);
      setTitle(""); setSummary("");
      // Refresh list in the background and open the new brief inline.
      refresh();
      setSelectedId(p.id);
    } catch (err) {
      console.error("[projects] create failed", err);
      toast.error("Couldn't create the project");
    } finally {
      setCreating(false);
    }
  }

  // Living brief in place — same tab, same shell.
  if (selectedId) {
    return (
      <ProjectBriefView
        id={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); refresh(); }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Projects</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            One place per thing you're working on. Attach captures, notes, files and signals — they roll up into a Living Brief.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Start a project</DialogTitle>
              <p className="text-[12.5px] text-muted-foreground">
                A project is a folder with a memory. Everything about one thing lives here, and Echo keeps a running brief.
              </p>
            </DialogHeader>
            <FlowRail beats={FLOWS.projects} className="sm:grid-cols-1" />
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">What is it called?</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Lamai Q3 rollout"
                  autoFocus
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["Trip to Bangkok", "Client onboarding", "Gym rollout", "Home move"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTitle(s)}
                      className="min-h-[32px] rounded-[2px] border border-border/60 px-2 text-[11px] text-foreground/85 hover:border-primary/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  What's it about? <span className="opacity-60">(optional)</span>
                </label>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="The running brief in your own words. You can edit this any time."
                  rows={3}
                />
              </div>
              <div className="rounded-[3px] border border-primary/30 bg-primary/5 p-2.5 text-[11.5px] leading-snug">
                <p className="vanta-machine-label mb-1 text-foreground/70">When you tap Create</p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  <li>The project opens straight away, empty and ready.</li>
                  <li>You can attach captures, notes, files and flights to it.</li>
                  <li>Echo writes nothing and sends nothing on its own.</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {(projects?.length ?? 0) === 0 && <FlowRail beats={FLOWS.projects} className="mb-3" />}

      <DeskIntro
        deskKey="projects"
        populated={(projects?.length ?? 0) > 0}
        onDo={(label) => { if (label === "Start a project") setOpen(true); }}
        className="mb-3"
      />

      {projects === null ? (
        <LoadingState rows={3} label="Loading projects" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="No projects yet"
          hint="A project is the anchor — captures, notes, files and signals attach to it and roll up into one Living Brief."
          actionLabel="Create your first project"
          onAction={() => setOpen(true)}
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="block w-full rounded-xl border border-border/60 bg-surface-elevated p-4 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {p.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      <h2 className="truncate text-base font-medium">{p.title}</h2>
                      <ProjectSticker project={p} />
                    </div>
                    {p.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <SurfaceAftermath surface="projects" />
    </div>
  );
}

