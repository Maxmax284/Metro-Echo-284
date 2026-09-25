import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useWorkspace, useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  Project,
  ProjectPlace,
  attachToProject,
  createProject,
  listProjects,
  projectPlace,
  setProjectPlace,
  updateProject,
} from "@/lib/projects";
import { ProjectEditDialog } from "@/components/projects/ProjectEditDialog";
import { ProjectsMap } from "@/components/projects/ProjectsMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, MapPin, Pencil, Pin, Plus } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { aftermathLine } from "@/lib/vantaNouns";
import { formatDistanceToNow } from "date-fns";
import { SeedItemsPicker } from "@/components/projects/SeedItemsPicker";
import type { SuggestedItem } from "@/lib/projectSuggestions";

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = useActiveOrgId();
  const { memberships } = useWorkspace();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [seedOrgId, setSeedOrgId] = useState<string | null>(orgId);
  const [seeds, setSeeds] = useState<Map<string, SuggestedItem>>(new Map());
  const [editing, setEditing] = useState<Project | null>(null);

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

  // Reset composer state whenever it opens, and align scope with the active scope.
  useEffect(() => {
    if (open) {
      setTitle("");
      setSummary("");
      setSummaryOpen(false);
      setSeeds(new Map());
      setSeedOrgId(orgId);
    }
  }, [open, orgId]);

  const scopeOptions = useMemo(() => {
    return [
      { value: "__personal__", label: "Personal" },
      ...memberships.map((m) => ({ value: m.organization_id, label: m.name })),
    ];
  }, [memberships]);

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
        scope: { userId: user.id, organizationId: seedOrgId },
      });
      // Attach any seeded items so the project opens already populated.
      const items = Array.from(seeds.values()).map((s) => ({
        type: s.type,
        id: s.id,
      }));
      if (items.length > 0) {
        try {
          await attachToProject({ projectId: p.id, userId: user.id, items });
        } catch (err) {
          console.error("[projects] seed attach failed", err);
          toast.warning("Project created, but some items couldn't attach");
        }
      }
      setOpen(false);
      if (items.length > 0) {
        toast.success({
          title: `Project created with ${items.length} item${items.length === 1 ? "" : "s"}`,
          description: aftermathLine({ verb: "Filed", appearsIn: "Projects" }),
        });
      }
      navigate(`/projects/${p.id}`);
    } catch (err) {
      console.error("[projects] create failed", err);
      toast.error("Couldn't create the project");
    } finally {
      setCreating(false);
    }
  }

  function toggleSeed(item: SuggestedItem) {
    const key = `${item.type}:${item.id}`;
    setSeeds((cur) => {
      const next = new Map(cur);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }

  const seedCount = seeds.size;

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
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/documents">Documents</Link>
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Lamai Q3 rollout"
                  autoFocus
                />
              </div>

              {/* Scope */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Scope</label>
                <Select
                  value={seedOrgId ?? "__personal__"}
                  onValueChange={(v) => {
                    setSeedOrgId(v === "__personal__" ? null : v);
                    setSeeds(new Map()); // scope change invalidates seed selection
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Suggestions and recent captures are pulled from this scope only.
                </p>
              </div>

              {/* Summary — collapsed by default */}
              <div>
                <button
                  type="button"
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {summaryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Summary <span className="opacity-60">(optional)</span>
                </button>
                {summaryOpen && (
                  <Textarea
                    className="mt-1"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="The running brief in your own words. You can edit this any time."
                    rows={3}
                  />
                )}
              </div>

              {/* Seed with… */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium">Seed with…</span>
                  {seedCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">{seedCount} selected</Badge>
                  )}
                </div>
                <SeedItemsPicker
                  userId={user.id}
                  organizationId={seedOrgId}
                  title={title}
                  summary={summary}
                  selected={new Set(seeds.keys())}
                  onToggle={toggleSeed}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : seedCount > 0 ? (
                  `Create with ${seedCount} item${seedCount === 1 ? "" : "s"}`
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {projects && projects.some((p) => projectPlace(p)) ? (
        <section className="mb-4">
          <ProjectsMap
            pins={projects.flatMap((p) => {
              const place = projectPlace(p);
              return place ? [{ id: p.id, lat: place.lat, lon: place.lon, label: p.title }] : [];
            })}
            onOpen={(id) => navigate(`/projects/${id}`)}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Only projects you gave a place to are on the map. Tap a pin to open that project.
          </p>
        </section>
      ) : null}

      {projects === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : projects.length === 0 ? (
        <div className="space-y-3">
          <FlowRail beats={FLOWS.projects} className="mb-3" />
          <EmptyState onNew={() => setOpen(true)} />
        </div>
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
                    {(() => {
                      const place = projectPlace(p);
                      return place ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {place.label || "Somewhere you pinned"}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`Edit ${p.title}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(p);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ProjectEditDialog
        project={editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={(next) => {
          setProjects((cur) => (cur ?? []).map((p) => (p.id === next.id ? next : p)));
          setEditing(null);
        }}
      />

      <AftermathHint text="Opening a project shows everything attached to it. Nothing runs from this list." />
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
