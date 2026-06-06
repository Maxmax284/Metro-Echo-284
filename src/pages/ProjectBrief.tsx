import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
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
import { ArrowLeft, FileText, Loader2, MoreVertical, Pin, PinOff, Search, Sparkles, Trash2, X, ScrollText, ListChecks, CheckSquare, MessageSquare, Notebook, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function ProjectBriefPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [resolved, setResolved] = useState<ResolvedItems | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [receipts, setReceipts] = useState<Array<{ id: string; event: string; created_at: string; payload: any }>>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id,event,created_at,payload")
        .eq("entity_type", "project")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (!cancelled) setReceipts((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [id, project?.updated_at]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, its] = await Promise.all([getProject(id), listProjectItems(id)]);
        if (cancelled) return;
        setProject(p);
        setSummaryDraft(p?.summary ?? "");
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

  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (project === undefined) return <Loading />;
  if (project === null) return <NotFoundPanel onBack={() => navigate("/projects")} />;

  const latest = useMemo(() => buildLatest(items, resolved), [items, resolved]);

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
    } catch {
      toast.error("Couldn't update");
    } finally { setBusy(false); }
  }

  async function changeStatus(status: Project["status"]) {
    if (!project) return;
    setBusy(true);
    try {
      const next = await updateProject(project.id, { status });
      setProject(next);
    } catch {
      toast.error("Couldn't update");
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!project) return;
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      navigate("/projects");
    } catch {
      toast.error("Couldn't delete");
    }
  }

  async function handleDetach(rowId: string) {
    try {
      await detachFromProject(rowId);
      const next = items.filter((i) => i.id !== rowId);
      setItems(next);
      setResolved(await resolveProjectItems(next));
    } catch {
      toast.error("Couldn't remove");
    }
  }

  async function handleSummarize() {
    if (!project) return;
    setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-summarize", {
        body: { project_id: project.id },
      });
      if (error) throw error;
      const text = (data as any)?.summary ?? "";
      if (!text) {
        toast.message("Nothing to summarize yet — attach a few items first.");
        return;
      }
      setSummaryDraft(text);
      toast.success("Draft ready — review and Save to commit.");
    } catch (err) {
      console.error("[brief] summarize failed", err);
      toast.error("Couldn't summarize right now.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:py-10">
      <header className="mb-4 flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} aria-label="Back to projects">
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

      {/* Living summary */}
      <section className="mb-6 rounded-2xl border border-border/60 bg-surface-elevated p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Living brief</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSummarize}
              disabled={summarizing || items.length === 0}
              aria-label="Summarize attached items into a draft brief"
            >
              {summarizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Summarize</>
              )}
            </Button>
            {summaryDraft !== project.summary && (
              <Button size="sm" onClick={handleSaveSummary} disabled={savingSummary}>
                {savingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            )}
          </div>
        </div>
        <Textarea
          value={summaryDraft}
          onChange={(e) => setSummaryDraft(e.target.value)}
          placeholder="Write the brief in your own words — or tap Summarize to draft one from the attached items. You can always edit before saving."
          rows={5}
          className="resize-none border-0 bg-transparent px-0 focus-visible:ring-0"
        />
      </section>

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
          <Section title="Latest" subtitle="What changed recently" empty={latest.length === 0 && "Nothing new this week."}>
            {latest.map((entry) => (
              <LatestRow key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </Section>

          <Section icon={<MessageSquare className="h-4 w-4" />} title="Captures" subtitle="Things you said or sent in" empty={resolved.captures.length === 0 && "None attached."}>
            {resolved.captures
              .slice()
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
              .map((c) => {
                const row = items.find((i) => i.item_type === "capture" && i.item_id === c.id)!;
                return (
                  <ItemCard key={c.id} onDetach={() => handleDetach(row.id)}
                    timestamp={c.created_at}>
                    <p className="whitespace-pre-wrap text-sm">{c.transcript ?? "(no transcript)"}</p>
                  </ItemCard>
                );
              })}
          </Section>

          <Section icon={<Notebook className="h-4 w-4" />} title="Notes" subtitle="The full body — read inline" empty={resolved.notes.length === 0 && "None attached."}>
            {resolved.notes.map((n) => {
              const row = items.find((i) => i.item_type === "note" && i.item_id === n.id)!;
              return (
                <ItemCard key={n.id} onDetach={() => handleDetach(row.id)} timestamp={n.updated_at}>
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
                <ItemCard key={f.id} onDetach={() => handleDetach(row.id)} timestamp={f.created_at}>
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

          <Section icon={<Search className="h-4 w-4" />} title="Signals" subtitle="Sherlock findings tied here" empty={resolved.findings.length === 0 && "None attached."}>
            {resolved.findings.map((s) => {
              const row = items.find((i) => i.item_type === "finding" && i.item_id === s.id)!;
              return (
                <ItemCard key={s.id} onDetach={() => handleDetach(row.id)} timestamp={s.created_at}>
                  <h3 className="text-sm font-medium">{s.title ?? "Finding"}</h3>
                  {s.summary && <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>}
                  <Badge variant="outline" className="mt-2 text-[10px] capitalize">{s.status}</Badge>
                </ItemCard>
              );
            })}
          </Section>

          <Section icon={<CheckSquare className="h-4 w-4" />} title="Commitments" empty={resolved.commitments.length === 0 && "None attached."}>
            {resolved.commitments.map((c) => {
              const row = items.find((i) => i.item_type === "commitment" && i.item_id === c.id)!;
              return (
                <ItemCard key={c.id} onDetach={() => handleDetach(row.id)} timestamp={c.updated_at}>
                  <p className="text-sm">{c.summary}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                    {c.due_at && (
                      <span className="text-[11px] text-muted-foreground">
                        Due {formatDistanceToNow(new Date(c.due_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </ItemCard>
              );
            })}
          </Section>

          <Section icon={<ListChecks className="h-4 w-4" />} title="Actions" empty={resolved.actions.length === 0 && "None attached."}>
            {resolved.actions.map((a) => {
              const row = items.find((i) => i.item_type === "action" && i.item_id === a.id)!;
              return (
                <ItemCard key={a.id} onDetach={() => handleDetach(row.id)} timestamp={a.updated_at}>
                  <p className="text-sm">{a.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                    {a.risk && (
                      <Badge variant="outline" className="text-[10px] capitalize">{a.risk} risk</Badge>
                    )}
                  </div>
                </ItemCard>
              );
            })}
          </Section>
        </div>
      )}
    </div>
  );
}

interface LatestEntry {
  kind: string; id: string; label: string; ts: string;
}

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
  children, onDetach, timestamp,
}: {
  children: React.ReactNode;
  onDetach: () => void;
  timestamp?: string;
}) {
  return (
    <div className="group relative rounded-xl border border-border/60 bg-surface-elevated p-3">
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
