import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  Project,
  createProject,
  listProjects,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Pin, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = useActiveOrgId();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listProjects({ userId: user.id, organizationId: orgId });
        if (!cancelled) setProjects(rows);
      } catch (err) {
        console.error("[projects] load failed", err);
        if (!cancelled) {
          setProjects([]);
          toast.error("Couldn't load projects");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, orgId]);

  if (authLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;

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
      navigate(`/projects/${p.id}`);
    } catch (err) {
      console.error("[projects] create failed", err);
      toast.error("Couldn't create the project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            One place per thing you're working on. Attach captures, notes, files and Sherlock signals — they all collect into a Living Brief.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Lamai Q3 rollout"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Summary <span className="opacity-60">(optional — what is this about?)</span>
                </label>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="The running brief in your own words. You can edit this any time."
                  rows={3}
                />
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

      {projects === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setOpen(true)} />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block rounded-xl border border-border/60 bg-surface-elevated p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {p.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      <h2 className="truncate text-base font-medium">{p.title}</h2>
                      {p.status !== "active" && (
                        <Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge>
                      )}
                    </div>
                    {p.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-surface-elevated/40 p-8 text-center">
      <h2 className="text-base font-medium">No projects yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        A project is the new anchor — captures, notes, files and Sherlock signals all attach to it and roll up into one Living Brief.
      </p>
      <Button onClick={onNew} className="mt-4 gap-1.5">
        <Plus className="h-4 w-4" /> Create your first project
      </Button>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
