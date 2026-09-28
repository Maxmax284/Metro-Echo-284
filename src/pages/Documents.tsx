// Global Documents surface — every document you can see, in one place.
// Same DocumentDetailSheet + NewDocumentDialog the project view uses, just
// listed across all projects within the active workspace scope.
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ChevronDown, ChevronUp, FilePlus2, FileSearch, FileText, HardHat, Loader2, Search, Sparkles } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";

import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { acknowledgeDocumentDraft, listAllDocuments, kindLabel, statusLabel, isDraftDocument, type DocumentRow } from "@/lib/documents";
import { type Project } from "@/lib/projects";
import { ProjectPickerBody } from "@/components/projects/ProjectPickerPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { DeskIntro } from "@/components/work/DeskIntro";
import { FlowRail, FLOWS } from "@/components/work/FlowRail";
import { DocumentDetailSheet } from "@/components/documents/DocumentDetailSheet";
import { NewDocumentDialog } from "@/components/documents/NewDocumentDialog";
import { AnalyzeDocumentDialog } from "@/components/documents/AnalyzeDocumentDialog";
import { useActivity } from "@/components/workstatus/ActivityStore";
import { WorkProgressCard } from "@/components/workstatus/WorkProgressCard";
import { listExportPresets, runExportPreset, EXPORT_PRESETS, type ExportPresetId } from "@/lib/exportPresets";

type Tab = "all" | "drafts" | "reviews";

export default function DocumentsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = useActiveOrgId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  /* Deep links from the Work shelf station: ?new=1 opens the draft composer,
     ?analyze=1 opens the analyze door. Params are consumed so a refresh or a
     back-nav doesn't reopen the dialog. */
  useEffect(() => {
    const wantsNew = searchParams.get("new") === "1";
    const wantsAnalyze = searchParams.get("analyze") === "1";
    if (!wantsNew && !wantsAnalyze) return;
    if (wantsNew) setComposerOpen(true);
    if (wantsAnalyze) setAnalyzeOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("analyze");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Project picker for presets that need one (e.g. project-summary-report).
  const [projectPickerFor, setProjectPickerFor] = useState<ExportPresetId | null>(null);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("vanta.documents.recentProjects");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  function rememberRecentProject(id: string) {
    setRecentProjectIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 5);
      try {
        window.localStorage.setItem("vanta.documents.recentProjects", JSON.stringify(next));
      } catch {
        /* storage disabled — ignore */
      }
      return next;
    });
  }

  const activity = useActivity();
  const docWorkItems = activity.items.filter(
    (i) => i.kind === "document" || i.kind === "export" || i.kind === "receipt",
  );

  function startPresetRun(presetId: ExportPresetId, project?: Project) {
    const preset = EXPORT_PRESETS[presetId];
    if (!preset) return;
    const handle = activity.start({
      kind: presetId === "receipt-capture-packet" ? "receipt" : "export",
      title: project ? `${preset.label} — ${project.title}` : preset.label,
      steps: [...preset.steps],
      projectName: project?.title,
    });
    void runExportPreset(
      presetId,
      {
        projectId: project?.id,
        projectName: project?.title,
        organizationId: orgId,
        onOpenProject: (id) => navigate(`/projects/${id}#living-brief`),
        onRegenerate: (id, name) => {
          const p = (project && project.id === id ? project : undefined)
            ?? ({ id, title: name ?? "Project" } as Project);
          startPresetRun(presetId, p);
        },
      },
      handle,
    );
  }

  // The shared picker loads and scopes its own project list, so this only has
  // to decide whether a preset needs one.
  function launchPreset(presetId: ExportPresetId) {
    const preset = EXPORT_PRESETS[presetId];
    if (!preset) return;
    if (preset.requiresProject) {
      setProjectPickerFor(presetId);
      return;
    }
    startPresetRun(presetId);
  }


  async function refresh() {
    try {
      const rows = await listAllDocuments({ organizationId: orgId });
      setDocs(rows);
    } catch (e) {
      console.error("[documents] load failed", e);
      setDocs([]);
      toast.error("Couldn't load documents");
    }
  }

  useEffect(() => {
    if (!user) return;
    setDocs(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgId]);

  useEffect(() => {
    if (!user) return;
    const documentId = searchParams.get("document");
    if (!documentId) return;
    setSelectedId(documentId);
    const source = searchParams.get("ack");
    if (source === "today" || source === "work" || source === "telegram") {
      void acknowledgeDocumentDraft(documentId, source).finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("ack");
        setSearchParams(next, { replace: true });
      });
    }
  }, [user, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    if (!docs) return [];
    const needle = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (tab === "drafts" && !isDraftDocument(d)) return false;
      if (tab === "reviews" && isDraftDocument(d)) return false;
      if (!needle) return true;
      return d.title.toLowerCase().includes(needle);
    });
  }, [docs, tab, query]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Documents</h1>
            <p className="text-[11.5px] text-muted-foreground">
              Drafts and reviews across every project. Nothing executes without you.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAnalyzeOpen(true)}>
            <FileSearch className="h-4 w-4" /> Analyze document
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Create…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                From existing memory
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {listExportPresets().map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => launchPreset(p.id)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-[12.5px] font-medium">{p.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    {p.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setComposerOpen(true)} className="gap-1.5">
            <FilePlus2 className="h-4 w-4" /> New document
          </Button>
        </div>
      </header>

      {docWorkItems.length > 0 && (
        <div className="mb-3 space-y-2">
          {docWorkItems.map((i) => (
            <WorkProgressCard key={i.id} item={i} onDismiss={() => activity.remove(i.id)} />
          ))}
        </div>
      )}

      {(docs?.length ?? 0) === 0 && <FlowRail beats={FLOWS.documents} className="mb-3" />}

      <DeskIntro
        deskKey="documents"
        populated={(docs?.length ?? 0) > 0}
        onDo={(label) => { if (label === "Draft from a template") setComposerOpen(true); }}
        className="mb-3"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">

        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            className="h-9 pl-7 text-sm"
          />
        </div>
        <div className="flex rounded-md border border-border/60 bg-surface-elevated/40 p-0.5">
          {(["all", "drafts", "reviews"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-[5px] px-2.5 py-1 text-[11.5px] capitalize transition-colors ${
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {docs === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border/60 p-8 text-center">
          <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {docs.length === 0
              ? "Documents you save for deeper review appear here. Tap New document to draft one, or drop a file into a project and Echo will read it."
              : "Nothing matches. Try a different filter."}
          </p>

        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setSelectedId(d.id)}
                className="w-full rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/30"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{d.title}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {kindLabel(d.kind)}
                  </Badge>
                  <Badge
                    variant={d.status === "failed" ? "destructive" : "outline"}
                    className="text-[10px] capitalize"
                  >
                    {statusLabel(d.status)}
                  </Badge>
                  {isDraftDocument(d) && (
                    <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                  {d.project_id && (
                    <>
                      {" · "}
                      <Link
                        to={`/projects/${d.project_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="underline-offset-2 hover:underline"
                      >
                        Project
                      </Link>
                    </>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AftermathHint text="Opening a document shows the draft and its review. Exports appear in Receipts." />

      {/* The roadmap sits under the working parts, not above them. */}
      <UnderConstructionBanner />

      <DocumentDetailSheet
        documentId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onChanged={refresh}
      />

      <NewDocumentDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        projectId={null}
        organizationId={orgId}
        onCreated={(id) => {
          setSelectedId(id);
          void refresh();
        }}
      />

      <AnalyzeDocumentDialog
        open={analyzeOpen}
        onOpenChange={setAnalyzeOpen}
        onAnalyzed={(ids) => {
          if (ids.length === 1) setSelectedId(ids[0]);
          void refresh();
        }}
      />

      <Dialog
        open={projectPickerFor !== null}
        onOpenChange={(o) => !o && setProjectPickerFor(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a project</DialogTitle>
            <DialogDescription className="text-[12px]">
              {projectPickerFor
                ? EXPORT_PRESETS[projectPickerFor].description
                : ""}
            </DialogDescription>
          </DialogHeader>
          <ProjectPickerBody
            recentIds={recentProjectIds}
            showSummary
            alwaysShowSearch
            autoFocusSearch
            emptyHint={
              <>
                <p className="text-foreground/85">No projects in this workspace yet.</p>
                <p className="mt-1 text-[12px]">
                  Create one from{" "}
                  <Link
                    to="/projects"
                    onClick={() => setProjectPickerFor(null)}
                    className="underline-offset-2 hover:underline"
                  >
                    Projects
                  </Link>{" "}
                  and attach a few notes or files, then come back.
                </p>
              </>
            }
            onPick={(p) => {
              const id = projectPickerFor;
              rememberRecentProject(p.id);
              setProjectPickerFor(null);
              if (id) startPresetRun(id, p);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------------------------------------------------------------------
// UnderConstructionBanner — honest "what works / what's coming" panel.
// Collapsed by default so the list stays the surface. Expanding it shows the
// roadmap so we don't pretend the module is done.
// ---------------------------------------------------------------------------
function UnderConstructionBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium">
            Drafting and review work now
            {open
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Cross-document analysis, multi-doc reports and obligation tracking
            are next. Tap for the full list.
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-[11.5px] leading-relaxed">
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
              Live now
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/85">
              <li>Draft from templates (NDA, SOW, service, payment, letter) with tone.</li>
              <li>Revise drafts in plain English — typed or dictated; nothing executes without approval.</li>
              <li>Multi-turn intake — Echo asks one question at a time, then reads it back before drafting.</li>
              <li>Upload a contract → extract → plain-English review: parties, key dates, money terms, obligations, risks, missing/unclear, questions to ask, verdict.</li>
              <li>Export packets: PDF (operator / client) + Word (operator / client / signature with watermark + sig page).</li>
              <li>"Ask Echo" prompts pre-fill the Companion (tighten, soften, boardroom, explain risks, before signing, money).</li>
            </ul>
          </section>

          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
              In progress / next
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/85">
              <li>Per-project style + signature defaults.</li>
            </ul>
          </section>

          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Parked (designed, not built)
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/85">
              <li>Sherlock-grade cross-analysis: compare a contract to your other docs/notes; flag conflicts, repeated parties, prior commitments.</li>
              <li>Multi-doc reports: roll several uploads into one risk/obligation digest.</li>
              <li>Obligation tracking → reminders + commitments auto-created from the review.</li>
              <li>Version compare (redline between draft revisions).</li>
              <li>Renewal / expiry watchers.</li>
              <li>Attorney handoff packet (review + redlines + questions, signed export).</li>
              <li>Template vault: save approved drafts as reusable templates.</li>
              <li>Inline "explain this clause" anchored to a selected paragraph.</li>
            </ul>
          </section>

          <p className="rounded-md border border-border/50 bg-muted/40 p-2 text-[10.5px] text-muted-foreground">
            None of this is legal advice. Plan → Approve → Execute applies to
            every change Echo makes here.
          </p>
        </div>
      )}
    </div>
  );
}

