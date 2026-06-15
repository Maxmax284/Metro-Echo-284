// Global Documents surface — every document you can see, in one place.
// Same DocumentDetailSheet + NewDocumentDialog the project view uses, just
// listed across all projects within the active workspace scope.
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ChevronDown, ChevronUp, FilePlus2, FileText, HardHat, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { listAllDocuments, kindLabel, statusLabel, isDraftDocument, type DocumentRow } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DocumentDetailSheet } from "@/components/documents/DocumentDetailSheet";
import { NewDocumentDialog } from "@/components/documents/NewDocumentDialog";

type Tab = "all" | "drafts" | "reviews";

export default function DocumentsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = useActiveOrgId();

  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

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
        <Button size="sm" onClick={() => setComposerOpen(true)} className="gap-1.5">
          <FilePlus2 className="h-4 w-4" /> New document
        </Button>
      </header>

      <UnderConstructionBanner />

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
          <p className="text-sm text-muted-foreground">
            {docs.length === 0
              ? "No documents yet. Tap New document to draft one, or drop a file into a project to review it."
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
    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium">
            Documents — still under construction
            {open
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Drafting + uploaded review work today. Deeper analysis, multi-doc
            reports, and obligation tracking are next. Tap to see the roadmap.
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
              <li>Revise drafts in plain English; nothing executes without approval.</li>
              <li>Upload a contract → extract → plain-English review: parties, key dates, money terms, obligations, risks, missing/unclear, questions to ask, verdict.</li>
              <li>Export packets: PDF (operator / client) + Word (operator / client / signature with watermark + sig page).</li>
              <li>"Ask Vanta" prompts pre-fill the Companion (tighten, soften, boardroom, explain risks, before signing, money).</li>
            </ul>
          </section>

          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
              In progress / next
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/85">
              <li>Conversational builder via voice (revision dictation through Companion).</li>
              <li>Multi-turn intake — Vanta asks for missing fields instead of one big form.</li>
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
            every change Vanta makes here.
          </p>
        </div>
      )}
    </div>
  );
}

