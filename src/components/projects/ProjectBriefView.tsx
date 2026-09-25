// ProjectBriefView — the Living Brief surface, decoupled from routing so it
// can render either inside the shell (under the Projects tab) or as its own
// page. Pure view: takes a project id + a back handler.
import { useEffect, useMemo, useState } from "react";
import {
  Project,
  ProjectItem,
  ResolvedItems,
  deleteProject,
  detachFromProject,
  getProject,
  listProjectItems,
  resolveProjectItems,
  updateProject,
} from "@/lib/projects";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, FileText, Loader2, MoreVertical, Pin, PinOff, Plus, Search, Sparkles,
  Trash2, X, ScrollText, CheckSquare, MessageSquare, Notebook, Receipt, Network,
} from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { LivingBriefBlocks, sourceCardId, type StructuredBrief } from "@/components/projects/LivingBriefBlocks";
import { ProjectInbox } from "@/components/projects/ProjectInbox";
import { SherlockFindingsChips } from "@/components/sherlock/SherlockFindingsChips";
import { ResearchSuggestionChip } from "@/components/research/ResearchSuggestionChip";
import { AttachItemsDialog } from "@/components/projects/AttachItemsDialog";
import { BriefExportsList } from "@/components/briefs/BriefExportsList";
import { BriefComposerSheet } from "@/components/briefs/BriefComposerSheet";
import { ProjectDocumentsSection } from "@/components/documents/ProjectDocumentsSection";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { useCanvas } from "@/components/entities/CanvasContext";
import { useScope } from "@/hooks/useScope";

export interface ProjectBriefViewProps {
  id: string;
  onBack: () => void;
  /** Called after a successful delete so parent can refresh / pop. */
  onDeleted?: () => void;
}

export function ProjectBriefView({ id, onBack, onDeleted }: ProjectBriefViewProps) {
  const { applyScope, key: scopeKey } = useScope();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [resolved, setResolved] = useState<ResolvedItems | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [tone, setTone] = useState<"operator" | "narrative">("narrative");
  const [structured, setStructured] = useState<StructuredBrief | null>(null);
  const [receipts, setReceipts] = useState<Array<{ id: string; event: string; created_at: string; payload: any }>>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [briefsRefreshKey, setBriefsRefreshKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const { openCanvas } = useCanvas();

  async function refreshAttached() {
    if (!project) return;
    const next = await listProjectItems(project.id);
    setItems(next);
    setResolved(await resolveProjectItems(next));
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await applyScope(supabase
        .from("audit_log")
        .select("id,event,created_at,payload")
        .eq("entity_type", "project")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(15));
      if (!cancelled) setReceipts((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [id, project?.updated_at, scopeKey]);

  // If the URL points at #living-brief (e.g. opened from the Activity Tray),
  // scroll the brief into view once the project has loaded.
  useEffect(() => {
    if (!project) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#living-brief") return;
    const el = document.getElementById("living-brief");
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [project?.id]);


  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Reset when switching projects so we don't show stale data.
    setProject(undefined);
    setItems([]);
    setResolved(null);
    setStructured(null);
    setSummaryDraft("");
    (async () => {
      try {
        const [p, its] = await Promise.all([getProject(id), listProjectItems(id)]);
        if (cancelled) return;
        setProject(p);
        setSummaryDraft(p?.summary ?? "");
        const bs = (p as any)?.brief_structured;
        if (bs && typeof bs === "object" && bs.blocks) {
          setStructured(bs as StructuredBrief);
          if (bs.tone === "operator" || bs.tone === "narrative") setTone(bs.tone);
        }
        setItems(its);
        const r = await resolveProjectItems(its);
        if (!cancelled) setResolved(r);
      } catch (err) {
        console.error("[brief] load failed", err);
        if (!cancelled) {
          setProject(null);
          toast.error("Couldn't load this project");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const latest = useMemo(() => buildLatest(items, resolved), [items, resolved]);

  if (project === undefined) return <Loading />;
  if (project === null) return <NotFoundPanel onBack={onBack} />;

  async function handleSaveSummary() {
    if (!project || summaryDraft === project.summary) return;
    setSavingSummary(true);
    try {
      const next = await updateProject(project.id, { summary: summaryDraft });
      setProject(next);
      toast.success("Summary saved");
    } catch (err) {
      console.error("[brief] save summary failed", err);
      toast.error("Couldn't save summary");
    } finally {
      setSavingSummary(false);
    }
  }

  async function togglePinned() {
    if (!project) return;
    setBusy(true);
    try {
      const next = await updateProject(project.id, { pinned: !project.pinned });
      setProject(next);
    } catch { toast.error("Couldn't update"); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: Project["status"]) {
    if (!project) return;
    setBusy(true);
    try {
      const next = await updateProject(project.id, { status });
      setProject(next);
    } catch { toast.error("Couldn't update"); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!project) return;
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      onDeleted ? onDeleted() : onBack();
    } catch { toast.error("Couldn't delete"); }
  }

  async function handleDetach(rowId: string) {
    try {
      await detachFromProject(rowId);
      const next = items.filter((i) => i.id !== rowId);
      setItems(next);
      setResolved(await resolveProjectItems(next));
    } catch { toast.error("Couldn't remove"); }
  }

  async function handleSummarize() {
    if (!project) return;
    setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-summarize", {
        body: { project_id: project.id, tone },
      });
      if (error) throw error;
      const payload = data as any;
      if (payload?.empty) {
        toast.message("Nothing to summarize yet — attach a few items first.");
        return;
      }
      if (payload?.structured) setStructured(payload.structured as StructuredBrief);
      if (payload?.summary) setSummaryDraft(payload.summary);
      // Bump the Past briefs list so the new export shows up immediately.
      setBriefsRefreshKey((k) => k + 1);
      toast.success("Living brief refreshed.");
    } catch (err) {
      console.error("[brief] summarize failed", err);
      toast.error("Couldn't summarize right now.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:py-8">
      <header className="mb-4 flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {project.pinned && <Pin className="h-4 w-4 text-primary" />}
            <h1 className="truncate text-xl font-semibold">{project.title}</h1>
            {project.status !== "active" && (
              <Badge variant="outline" className="text-[10px] capitalize">{project.status}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => openCanvas(null, { projectId: project.id })}
          aria-label="Open canvas scoped to this project"
        >
          <Network className="h-4 w-4" /> Canvas
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setExportOpen(true)}
          disabled={items.length === 0}
          aria-label="Create export from this project"
        >
          <FileText className="h-4 w-4" /> Create export
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy} aria-label="More">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={togglePinned}>
              {project.pinned ? <><PinOff className="mr-2 h-4 w-4" /> Unpin</> : <><Pin className="mr-2 h-4 w-4" /> Pin</>}
            </DropdownMenuItem>
            {project.status !== "active" && (
              <DropdownMenuItem onClick={() => changeStatus("active")}>Mark active</DropdownMenuItem>
            )}
            {project.status !== "paused" && (
              <DropdownMenuItem onClick={() => changeStatus("paused")}>Pause</DropdownMenuItem>
            )}
            {project.status !== "archived" && (
              <DropdownMenuItem onClick={() => changeStatus("archived")}>Archive</DropdownMenuItem>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete project
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The project and its attachments are removed. The attached notes, files and captures themselves stay in your memory — only the connections to this project go away.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SherlockFindingsChips
          sourceObjectType="freeform"
          sourceObjectId={project.id}
          max={4}
        />
        {items.length >= 2 && (
          <ResearchSuggestionChip
            label="Look outside on this?"
            prompt={`Outside context for "${project.title}": recurring themes, comparable cases, and risks worth knowing before the next decision.`}
            relatedEntityType="project"
            relatedEntityId={project.id}
            projectId={project.id}
            triggerReason={`${project.title} has ${items.length} attached items worth checking outside context on.`}
            onCompleted={(r) => { if (r?.brief_export_id) setBriefsRefreshKey((k) => k + 1); }}
          />
        )}
      </div>

      <ProjectInbox
        project={project}
        attached={items}
        onAttached={refreshAttached}
      />

      <ProjectDocumentsSection projectId={project.id} organizationId={project.organization_id ?? null} />

      <AttachItemsDialog
        project={project}
        attached={items}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAttached={refreshAttached}
      />

      <ProjectDashboard projectId={project.id} />

      {/* Living brief */}
      <section id="living-brief" className="mb-6 space-y-4 rounded-2xl border border-border/60 bg-surface-elevated p-4 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Living brief</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-border/60 text-[11px]">
              <button
                type="button"
                onClick={() => setTone("narrative")}
                className={`px-2 py-1 transition-colors ${tone === "narrative" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={tone === "narrative"}
              >
                Narrative
              </button>
              <button
                type="button"
                onClick={() => setTone("operator")}
                className={`px-2 py-1 transition-colors ${tone === "operator" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={tone === "operator"}
              >
                Operator
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSummarize}
              disabled={summarizing || items.length === 0}
              aria-label={structured ? "Regenerate the structured Living Brief" : "Summarize this project into a structured Living Brief"}
            >
              {summarizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> {structured ? "Regenerate" : "Summarize"}</>
              )}
            </Button>

          </div>
        </div>

        {structured ? (
          <LivingBriefBlocks brief={structured} />
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {items.length === 0
              ? "Attach a few captures, notes, or files, then tap Summarize."
              : "Tap Summarize to draft a structured Living Brief with citations back to every source."}
          </p>
        )}

        <details className="group">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 hover:text-foreground">
            Your own words {summaryDraft !== project.summary && <span className="ml-1 text-primary">· unsaved</span>}
          </summary>
          <div className="mt-2 space-y-2">
            <Textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              placeholder="Optional — write the brief in your own voice. Saved alongside the structured one."
              rows={4}
              className="resize-none"
            />
            {summaryDraft !== project.summary && (
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveSummary} disabled={savingSummary}>
                  {savingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            )}
          </div>
        </details>
      </section>

      {/* Saved exports — every Summarize lands here as a draft, every approved export keeps its PDF */}
      <section className="mb-6 space-y-3 rounded-2xl border border-border/60 bg-surface-elevated p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">What this project puts out</h2>
          <span className="text-[10.5px] text-muted-foreground/70">Also filed in Receipts</span>
        </div>
        <BriefExportsList key={briefsRefreshKey} projectId={project.id} />
      </section>

      <BriefComposerSheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultScope="project"
        projectId={project.id}
        entityLabel={project.title}
        defaultFormat="operator"
        defaultAudience="internal_operator"
      />


      {/* Sections */}
      {resolved === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          <p>Nothing attached yet.</p>
          <p className="mt-1 opacity-70">
            From any capture, note, file or Sherlock finding, choose <strong>Attach to project</strong> to add it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Recent changes" subtitle="What moved in the last week" empty={latest.length === 0 && "Nothing new this week."}>
            {latest.map((entry) => (
              <LatestRow key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </Section>

          <Section
            icon={<CheckSquare className="h-4 w-4" />}
            title="Needs me"
            subtitle="Open commitments and pending actions"
            empty={
              resolved.commitments.filter((c) => c.status !== "done" && c.status !== "cancelled").length === 0
              && resolved.actions.filter((a) => a.status !== "executed" && a.status !== "cancelled").length === 0
              && "Nothing waiting on you."
            }
          >
            {resolved.commitments
              .filter((c) => c.status !== "done" && c.status !== "cancelled")
              .sort((a, b) => {
                const ad = a.due_at ? +new Date(a.due_at) : Infinity;
                const bd = b.due_at ? +new Date(b.due_at) : Infinity;
                return ad - bd;
              })
              .map((c) => {
                const row = items.find((i) => i.item_type === "commitment" && i.item_id === c.id)!;
                return (
                  <ItemCard key={`c-${c.id}`} domId={sourceCardId("commitment", c.id)} onDetach={() => handleDetach(row.id)} timestamp={c.updated_at}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">Commitment</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                      {c.due_at && (
                        <span className="text-[11px] text-muted-foreground">
                          Due {formatDistanceToNow(new Date(c.due_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{c.summary}</p>
                  </ItemCard>
                );
              })}
            {resolved.actions
              .filter((a) => a.status !== "executed" && a.status !== "cancelled")
              .map((a) => {
                const row = items.find((i) => i.item_type === "action" && i.item_id === a.id)!;
                return (
                  <ItemCard key={`a-${a.id}`} domId={sourceCardId("action", a.id)} onDetach={() => handleDetach(row.id)} timestamp={a.updated_at}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">Action</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                      {a.risk && (
                        <Badge variant="outline" className="text-[10px] capitalize">{a.risk} risk</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{a.title}</p>
                  </ItemCard>
                );
              })}
          </Section>

          <Section icon={<Search className="h-4 w-4" />} title="Signals" subtitle="Sherlock findings tied here" empty={resolved.findings.length === 0 && "None attached."}>
            {resolved.findings.map((s) => {
              const row = items.find((i) => i.item_type === "finding" && i.item_id === s.id)!;
              return (
                <ItemCard key={s.id} domId={sourceCardId("finding", s.id)} onDetach={() => handleDetach(row.id)} timestamp={s.created_at}>
                  <h3 className="text-sm font-medium">{s.title ?? "Finding"}</h3>
                  {s.summary && <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>}
                  <Badge variant="outline" className="mt-2 text-[10px] capitalize">{s.status}</Badge>
                </ItemCard>
              );
            })}
          </Section>

          <Section icon={<Notebook className="h-4 w-4" />} title="Notes" subtitle="Full bodies, read inline" empty={resolved.notes.length === 0 && "None attached."}>
            {resolved.notes.map((n) => {
              const row = items.find((i) => i.item_type === "note" && i.item_id === n.id)!;
              return (
                <ItemCard key={n.id} domId={sourceCardId("note", n.id)} onDetach={() => handleDetach(row.id)} timestamp={n.updated_at}>
                  {n.title && <h3 className="mb-1 text-sm font-medium">{n.title}</h3>}
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{n.body || <span className="opacity-50">(empty)</span>}</p>
                </ItemCard>
              );
            })}
          </Section>

          <Section icon={<FileText className="h-4 w-4" />} title="Files" empty={resolved.files.length === 0 && "None attached."}>
            {resolved.files.map((f) => {
              const row = items.find((i) => i.item_type === "file" && i.item_id === f.id)!;
              return (
                <ItemCard key={f.id} domId={sourceCardId("file", f.id)} onDetach={() => handleDetach(row.id)} timestamp={f.created_at}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{f.filename}</span>
                  </div>
                  {f.extracted_text && (
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{f.extracted_text}</p>
                  )}
                </ItemCard>
              );
            })}
          </Section>

          <Section icon={<MessageSquare className="h-4 w-4" />} title="Captures" subtitle="Things you said or sent in" empty={resolved.captures.length === 0 && "None attached."}>
            {resolved.captures
              .slice()
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
              .map((c) => {
                const row = items.find((i) => i.item_type === "capture" && i.item_id === c.id)!;
                return (
                  <ItemCard key={c.id} domId={sourceCardId("capture", c.id)} onDetach={() => handleDetach(row.id)} timestamp={c.created_at}>
                    <p className="whitespace-pre-wrap text-sm">{c.transcript ?? "(no transcript)"}</p>
                  </ItemCard>
                );
              })}
          </Section>

          <Section
            icon={<Receipt className="h-4 w-4" />}
            title="Receipts"
            subtitle="What happened on this project"
            empty={receipts.length === 0 && "No events recorded yet."}
          >
            {receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2 text-sm"
              >
                <Badge variant="outline" className="text-[10px]">{r.event}</Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {r.payload && typeof r.payload === "object"
                    ? Object.entries(r.payload as Record<string, unknown>)
                        .slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
                        .join(" · ")
                    : ""}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

interface LatestEntry { kind: string; id: string; label: string; ts: string; }

function buildLatest(items: ProjectItem[], r: ResolvedItems | null): LatestEntry[] {
  if (!r) return [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const all: LatestEntry[] = [
    ...r.notes.map((n) => ({ kind: "note", id: n.id, label: n.title ?? "Untitled note", ts: n.updated_at })),
    ...r.captures.map((c) => ({ kind: "capture", id: c.id, label: (c.transcript ?? "").slice(0, 80) || "Capture", ts: c.created_at })),
    ...r.files.map((f) => ({ kind: "file", id: f.id, label: f.filename, ts: f.created_at })),
    ...r.findings.map((s) => ({ kind: "finding", id: s.id, label: s.title ?? "Finding", ts: s.created_at })),
    ...r.commitments.map((c) => ({ kind: "commitment", id: c.id, label: c.summary, ts: c.updated_at })),
    ...r.actions.map((a) => ({ kind: "action", id: a.id, label: a.title, ts: a.updated_at })),
  ];
  return all
    .filter((e) => +new Date(e.ts) >= weekAgo)
    .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
    .slice(0, 6);
}

function LatestRow({ entry }: { entry: LatestEntry }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2 text-sm">
      <Badge variant="outline" className="text-[10px] capitalize">{entry.kind}</Badge>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {formatDistanceToNow(new Date(entry.ts), { addSuffix: true })}
      </span>
    </div>
  );
}

function Section({
  title, subtitle, icon, empty, children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  empty?: string | false;
  children: React.ReactNode;
}) {
  const childArr = Array.isArray(children) ? children : [children];
  const hasContent = childArr.some(Boolean);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">· {subtitle}</span>}
      </div>
      {hasContent ? (
        <div className="space-y-2">{children}</div>
      ) : empty ? (
        <p className="px-1 text-xs text-muted-foreground">{empty}</p>
      ) : null}
    </section>
  );
}

function ItemCard({
  children, onDetach, timestamp, domId,
}: {
  children: React.ReactNode;
  onDetach: () => void;
  timestamp?: string;
  domId?: string;
}) {
  return (
    <div id={domId} className="group relative scroll-mt-24 rounded-xl border border-border/60 bg-surface-elevated p-3 transition-shadow">
      <div>{children}</div>
      <div className="mt-2 flex items-center justify-between">
        {timestamp ? (
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
          </span>
        ) : <span />}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onDetach}
        >
          <X className="mr-1 h-3 w-3" /> Remove
        </Button>
      </div>
    </div>
  );
}

function NotFoundPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <ScrollText className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-medium">Project not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been deleted or you don't have access.</p>
      <Button onClick={onBack} className="mt-4" variant="outline">Back to projects</Button>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-60 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
