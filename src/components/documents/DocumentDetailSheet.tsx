// DocumentDetailSheet — Phase 1 review surface for an uploaded business document.
// Mobile-first (validated at 384px). Sections: Summary, Parties, Key dates,
// Money terms, Obligations, Risks, Missing or unclear, Questions to ask,
// Verdict, Soft disclaimer. Sticky footer: Re-review · Receipts.
import { useCallback, useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, BookOpen, Calendar, Check, CheckCircle2, Coins, FileSearch,
  FileDown, FileSignature, FileText, HelpCircle, Loader2, MessageSquareWarning, Pencil,
  Receipt, RefreshCcw, Send, Sparkles, ShieldAlert, Users,
  GitCompare,
} from "lucide-react";

import { vantaToast as toast } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import {
  DOCUMENT_DISCLAIMER, acknowledgeDocumentDraft, approveDraft, getDocument, getLatestReview,
  getLatestVersion, isDraftDocument, kindLabel, runDraft,
  runExtraction, runReview, statusLabel,
  type DocumentObligation, type DocumentReview, type DocumentRisk, type DocumentRow,
  type DocumentVersion,
} from "@/lib/documents";
import {
  finalizeDocumentExport, saveDocumentExportDraft,
  type DocumentExportAudience,
} from "@/lib/documentExport";
import {
  finalizeDraftExport, saveDraftExportDraft, type DraftExportAudience,
} from "@/lib/documentDraftExport";
import { exportDraftDocx } from "@/lib/documentDocxExport";


import { getTemplate } from "@/lib/documentTemplates";
import { BriefPdfDocument } from "@/components/briefs/BriefPdfDocument";
import { useAskContext } from "@/hooks/useAskContext";
import { DocumentToolPlan, type ToolPlanStepKey } from "./DocumentToolPlan";
import { ObligationList } from "./ObligationList";
import { DocumentCompareSheet } from "./DocumentCompareSheet";
import { DocumentReceiptsTimeline } from "./DocumentReceiptsTimeline";
import { ResearchSuggestionChip } from "@/components/research/ResearchSuggestionChip";
import { DictateButton } from "@/components/ui/dictate-button";

// Common revision asks, so the box never starts from a blank page.
const REVISION_PRESETS = [
  "Tighten section 3.",
  "Add a confidentiality clause.",
  "Make the payment terms clearer.",
  "Shorten the closing.",
] as const;

interface Props {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function DocumentDetailSheet({ documentId, open, onOpenChange, onChanged }: Props) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [risks, setRisks] = useState<DocumentRisk[]>([]);
  const [obligations, setObligations] = useState<DocumentObligation[]>([]);
  const [version, setVersion] = useState<DocumentVersion | null>(null);
  /* Read-only compare view. It never writes, so it can open at any status. */
  const [compareOpen, setCompareOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<
    null | "extract" | "review" | "draft" | "revise" | "approve"
    | "export-operator" | "export-client" | "export-signature" | "export-docx"
  >(null);


  const [revisionText, setRevisionText] = useState("");
  const { openAskWithContext } = useAskContext();

  const isDraft = !!doc && isDraftDocument(doc);

  const refresh = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const d = await getDocument(documentId);
      setDoc(d);
      if (d && !d.source_file_id && d.template_key) {
        // Draft path — only need the latest version body.
        const v = await getLatestVersion(documentId);
        setVersion(v);
        setReview(null); setRisks([]); setObligations([]);
      } else {
        const { review, risks, obligations } = await getLatestReview(documentId);
        setReview(review);
        setRisks(risks);
        setObligations(obligations);
        setVersion(null);
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open && documentId) {
      void refresh();
      void acknowledgeDocumentDraft(documentId, "documents");
    }
  }, [open, documentId, refresh]);

  async function handleExtract() {
    if (!documentId) return;
    setBusy("extract");
    try {
      const r = await runExtraction(documentId);
      if (!r.ok) {
        toast.error(r.error === "no_text"
          ? "Couldn't read text from this file yet."
          : "Extraction failed. Try again.");
      } else {
        toast.success("Document is ready to review.");
      }
      await refresh();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function handleReview() {
    if (!documentId) return;
    setBusy("review");
    try {
      const r = await runReview(documentId);
      if (!r.ok) {
        toast.error(r.error === "rate_limited"
          ? "Over rate limit. Try again in a minute."
          : r.error === "credits_exhausted"
          ? "Out of review credits."
          : "Review failed. Try again.");
      } else {
        toast.success("Review ready.");
      }
      await refresh();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(audience: DocumentExportAudience | DraftExportAudience) {
    if (!documentId) return;
    const busyKey =
      audience === "client" ? "export-client"
      : audience === "signature" ? "export-signature"
      : "export-operator";
    setBusy(busyKey);
    try {
      // Drafts and reviews use different brief builders.
      const isSignature = audience === "signature";
      if (isSignature && !isDraft) {
        toast.error("Signature packets are available on drafted documents.");
        return;
      }
      const builder = isDraft ? saveDraftExportDraft : saveDocumentExportDraft;
      const finalizer = isDraft ? finalizeDraftExport : finalizeDocumentExport;
      const { row, brief, doc: docRow } = await builder({
        document_id: documentId, audience: audience as any,
      });
      const pdfBlob = await pdf(<BriefPdfDocument brief={brief} />).toBlob();
      await finalizer({
        row, pdfBlob, document_id: docRow.id, audience: audience as any,
      });
      const url = URL.createObjectURL(pdfBlob);
      const a = window.document.createElement("a");
      a.href = url;
      const suffix = isSignature ? "-signature" : "";
      a.download = `${brief.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}${suffix}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(
        isSignature ? "Signature packet exported."
        : audience === "client" ? "Client packet exported."
        : "Operator packet exported.",
      );
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleExportDocx(audience: DraftExportAudience) {
    if (!documentId) return;
    setBusy("export-docx");
    try {
      await exportDraftDocx({ document_id: documentId, audience });
      toast.success("Word doc exported.");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "DOCX export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }



  async function handleRevise() {
    if (!documentId || !doc) return;
    const prompt = revisionText.trim();
    if (!prompt) {
      toast.error("Describe the change you want.");
      return;
    }
    const template = getTemplate(doc.template_key);
    setBusy("revise");
    try {
      const r = await runDraft({
        documentId,
        templateTitle: template?.promptTitle ?? doc.title,
        userMessage: template
          ? template.buildUserMessage(
              Object.fromEntries(Object.entries(doc.draft_inputs ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
              (doc.tone as any) ?? "warm",
            )
          : `Document: ${doc.title}`,
        revisionPrompt: prompt,
      });
      if (!r.ok) {
        toast.error(
          r.error === "rate_limited" ? "Over rate limit. Try again in a minute."
          : r.error === "credits_exhausted" ? "Out of drafting credits."
          : "Revision failed. Try again.",
        );
      } else {
        const next = await getLatestVersion(documentId);
        toast.success(
          next ? `Draft updated — now version ${next.version_no}.` : "Draft updated.",
        );
        setRevisionText("");
      }
      await refresh();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function handleApproveDraft() {
    if (!documentId) return;
    setBusy("approve");
    try {
      await approveDraft(documentId);
      toast.success("Draft approved.");
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't approve.");
    } finally {
      setBusy(null);
    }
  }

  function handleAskDraft(kind: "tighten" | "soften" | "boardroom") {
    if (!doc) return;
    const map: Record<typeof kind, string> = {
      tighten: `Rewrite the draft of "${doc.title}" to be 30% shorter without losing any obligations. Suggest the changes — don't apply them.`,
      soften:  `Suggest a warmer, more human revision of "${doc.title}" while keeping every commitment the same.`,
      boardroom: `Suggest a more boardroom-formal revision of "${doc.title}". Keep the structure; tighten the language.`,
    };
    void openAskWithContext({ kind: "document", id: doc.id, label: doc.title, question: map[kind] });
    onOpenChange(false);
  }

  function handleAsk(kind: "explain-risk" | "before-signing" | "money") {
    if (!doc) return;
    const map: Record<typeof kind, string> = {
      "explain-risk":
        `For the document "${doc.title}", walk me through the highest-severity risks in plain English. What would each one mean for me in practice? No legal advice — just help me understand.`,
      "before-signing":
        `Before I sign "${doc.title}", what should I ask the other side? Use the review Echo already produced. Draft the questions as a short list I can send.`,
      "money":
        `Summarize the money terms in "${doc.title}" — fees, deposits, late charges, refunds, who pays when. Plain English, no legal interpretation.`,
    };
    void openAskWithContext({ kind: "document", id: doc.id, label: doc.title, question: map[kind] });
    onOpenChange(false);
  }

  async function runPlan(steps: ToolPlanStepKey[]) {
    for (const step of steps) {
      if (step === "extract") await handleExtract();
      else if (step === "review") await handleReview();
      else if (step === "export-operator") await handleExport("operator");
    }
  }



  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto pb-32 sm:max-w-2xl">
        {!doc || loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <SheetTitle className="sr-only">Document</SheetTitle>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <SheetHeader className="mb-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="capitalize">{kindLabel(doc.kind)}</Badge>
                <Badge
                  variant={doc.status === "failed" ? "destructive" : "outline"}
                  className="capitalize"
                >
                  {statusLabel(doc.status)}
                </Badge>
                <span>Updated {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}</span>
              </div>
              <SheetTitle className="text-left text-base sm:text-lg">{doc.title}</SheetTitle>
              {doc.failure_reason && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {doc.failure_reason}
                </p>
              )}
            </SheetHeader>

            {/* Primary action row — what to do next */}
            <div className="mb-6 flex flex-wrap gap-2">
              {!isDraft && (doc.status === "uploaded" || doc.status === "failed") && (
                <Button size="sm" onClick={handleExtract} disabled={!!busy} className="gap-1.5">
                  {busy === "extract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  Read document
                </Button>
              )}
              {!isDraft && (doc.status === "extracted" || doc.status === "reviewed") && (
                <Button
                  size="sm"
                  onClick={handleReview}
                  disabled={!!busy}
                  className="gap-1.5"
                >
                  {busy === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {review ? "Re-review" : "Review document"}
                </Button>
              )}
              {isDraft && doc.status === "drafted" && (
                <Button size="sm" onClick={handleApproveDraft} disabled={!!busy} className="gap-1.5">
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve draft
                </Button>
              )}
              {isDraft && doc.status === "approved" && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Check className="h-3 w-3" /> Approved
                </Badge>
              )}
              {/* Reading only — comparing two versions changes neither. */}
              <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)} className="gap-1.5">
                <GitCompare className="h-4 w-4" />
                Compare versions
              </Button>
            </div>

            <DocumentCompareSheet
              documentId={doc.id}
              title={doc.title}
              open={compareOpen}
              onOpenChange={setCompareOpen}
            />


            {!isDraft && (
              <div className="mb-6">
                <DocumentToolPlan
                  status={doc.status}
                  isDraft={isDraft}
                  busy={!!busy}
                  hasReview={!!review}
                  onRun={runPlan}
                />
              </div>
            )}



            {isDraft ? (
              <DraftBody
                doc={doc}
                version={version}
                revisionText={revisionText}
                setRevisionText={setRevisionText}
                busy={busy}
                onRevise={handleRevise}
                onExport={handleExport}
                onExportDocx={handleExportDocx}
                onAsk={handleAskDraft}
              />

            ) : review ? (
              <div className="space-y-6">
                <Section icon={<FileSearch className="h-4 w-4" />} title="Summary">
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{review.summary ?? "—"}</p>
                </Section>


                {review.parties?.length > 0 && (
                  <Section icon={<Users className="h-4 w-4" />} title="Parties">
                    <ul className="space-y-1.5 text-sm">
                      {review.parties.map((p, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.role && <span className="text-xs text-muted-foreground">· {p.role}</span>}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {review.key_dates?.length > 0 && (
                  <Section icon={<Calendar className="h-4 w-4" />} title="Key dates">
                    <ul className="space-y-1.5 text-sm">
                      {review.key_dates.map((d, i) => (
                        <li key={i}>
                          <span className="text-muted-foreground">{d.label}:</span>{" "}
                          <span className="font-medium">{d.when}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {review.money_terms?.length > 0 && (
                  <Section icon={<Coins className="h-4 w-4" />} title="Money terms">
                    <ul className="space-y-1.5 text-sm">
                      {review.money_terms.map((m, i) => (
                        <li key={i}>
                          <span className="text-muted-foreground">{m.label}:</span>{" "}
                          <span className="font-medium">{m.amount}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {risks.length > 0 && (
                  <Section icon={<ShieldAlert className="h-4 w-4" />} title="Risks">
                    <ul className="space-y-3">
                      {risks.map((r) => (
                        <li key={r.id} className="rounded-md border border-border/60 bg-surface-elevated p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={r.severity === "high" ? "destructive" : "outline"}
                              className="text-[10px] capitalize"
                            >
                              {r.severity} risk
                            </Badge>
                            <span className="text-sm font-medium">{r.title}</span>
                            {r.clause_ref && (
                              <span className="text-[11px] text-muted-foreground">· {r.clause_ref}</span>
                            )}
                          </div>
                          {r.plain_english && (
                            <p className="mt-1.5 text-sm text-foreground/85">{r.plain_english}</p>
                          )}
                          {r.suggested_question && (
                            <p className="mt-1.5 text-xs italic text-muted-foreground">
                              Ask: {r.suggested_question}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section icon={<AlertTriangle className="h-4 w-4" />} title="Obligations">
                  <ObligationList
                    obligations={obligations}
                    documentId={doc.id}
                    documentTitle={doc.title}
                  />
                </Section>

                {review.missing_or_unclear?.length > 0 && (
                  <Section icon={<MessageSquareWarning className="h-4 w-4" />} title="Missing or unclear">
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {review.missing_or_unclear.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </Section>
                )}

                {review.questions_to_ask?.length > 0 && (
                  <Section icon={<HelpCircle className="h-4 w-4" />} title="Questions to ask">
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {review.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </Section>
                )}

                {review.verdict && (
                  <Section title="Verdict">
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{review.verdict}</p>
                  </Section>
                )}

                {/* Ask Echo — drafts only, no execution */}
                <Section icon={<Sparkles className="h-4 w-4" />} title="Ask Echo">
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => handleAsk("explain-risk")}>
                      Explain risks in plain English
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => handleAsk("before-signing")}>
                      Questions to ask before signing
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => handleAsk("money")}>
                      Summarize money terms
                    </Button>
                  </div>
                  <div className="pt-1">
                    <ResearchSuggestionChip
                      prompt={`For the document "${doc.title}", find a few outside examples and common practices around the risks and clauses Echo flagged. Summarize in plain English with sources.`}
                      label="Look outside for examples"
                      relatedEntityType="document"
                      relatedEntityId={doc.id}
                      projectId={doc.project_id ?? undefined}
                      triggerReason="document_review"
                      onCompleted={() => refresh()}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These open a draft in Metro Echo — nothing sends until you say so.
                  </p>
                </Section>


                {/* Export packets */}
                <Section icon={<FileDown className="h-4 w-4" />} title="Export review packet">
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" className="h-8 gap-1.5 text-xs"
                      onClick={() => handleExport("operator")}
                      disabled={!!busy}>
                      {busy === "export-operator"
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FileDown className="h-3.5 w-3.5" />}
                      Operator packet
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                      onClick={() => handleExport("client")}
                      disabled={!!busy}>
                      {busy === "export-client"
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5" />}
                      Client-ready packet
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Operator keeps risks and severity. Client version hides them as
                    "Considerations" and includes the trust disclaimer.
                  </p>
                </Section>

                <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {DOCUMENT_DISCLAIMER}
                </p>

                <Section icon={<Receipt className="h-4 w-4" />} title="Receipts">
                  <DocumentReceiptsTimeline documentId={doc.id} />
                </Section>

                <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
                  <span>Reviewed {formatDistanceToNow(new Date(review.generated_at), { addSuffix: true })}</span>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleReview} disabled={!!busy}>
                    <RefreshCcw className="h-3.5 w-3.5" /> Re-review
                  </Button>
                </div>

              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                {doc.status === "uploaded" && "Tap Read document to extract its text. Echo won't run AI until you tap."}
                {doc.status === "extracting" && "Reading the document…"}
                {doc.status === "extracted" && "Text is ready. Tap Review document for the plain-English breakdown."}
                {doc.status === "reviewing" && "Reading and explaining…"}
                {doc.status === "failed" && (doc.failure_reason ?? "Something went sideways. Try again.")}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// DraftBody — Phase 2 "this is a drafted document" surface.
// Renders the latest markdown body, a revision input, export controls, and
// the Companion contextual prompts (drafts only — Plan → Approve → Execute).
// ---------------------------------------------------------------------------

interface DraftBodyProps {
  doc: DocumentRow;
  version: DocumentVersion | null;
  revisionText: string;
  setRevisionText: (s: string) => void;
  busy: null | string;
  onRevise: () => void;
  onExport: (audience: DraftExportAudience) => void;
  onExportDocx: (audience: DraftExportAudience) => void;
  onAsk: (kind: "tighten" | "soften" | "boardroom") => void;
}

function DraftBody({
  doc, version, revisionText, setRevisionText,
  busy, onRevise, onExport, onExportDocx, onAsk,
}: DraftBodyProps) {

  const body = version?.body_text ?? "";
  const isLocked = doc.status === "approved";
  const evidence = Array.isArray(doc.draft_inputs?.evidence)
    ? doc.draft_inputs.evidence.filter((item): item is { kind: "note" | "receipt"; id: string; label: string; recordedAt: string } => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return (row.kind === "note" || row.kind === "receipt") && typeof row.id === "string" && typeof row.label === "string";
      })
    : [];

  if (!version && (doc.status === "drafting" || doc.status === "failed")) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        {doc.status === "drafting" && "Drafting…"}
        {doc.status === "failed" && (doc.failure_reason ?? "Drafting didn't finish. Try again.")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section icon={<FileText className="h-4 w-4" />} title={isLocked ? "Approved draft" : "Working draft"}>
        <article className="prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-border/60 bg-background p-4 text-sm leading-relaxed text-foreground/90">
          {body || "—"}
        </article>
        {version && (
          <p className="text-[11px] text-muted-foreground">
            Version {version.version_no} · {version.source}
          </p>
        )}
      </Section>

      {evidence.length > 0 && (
        <Section icon={<Receipt className="h-4 w-4" />} title="Evidence used">
          <div className="grid gap-2 sm:grid-cols-2">
            {evidence.map((item) => (
              <div key={`${item.kind}:${item.id}`} className="rounded-md border border-border/60 bg-surface-elevated/30 p-2.5">
                <p className="break-words text-xs font-medium">{item.label}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{item.kind === "note" ? "Note" : "Receipt"}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!isLocked && (
        <Section icon={<Pencil className="h-4 w-4" />} title="Revise">
          <textarea
            value={revisionText}
            onChange={(e) => setRevisionText(e.target.value)}
            placeholder="What should change? (e.g. tighten section 3, add a confidentiality clause)"
            className="min-h-[80px] w-full rounded-md border border-border/60 bg-background p-2.5 text-sm"
            aria-label="Describe the revision"
          />
          {/* Speak it instead of typing it. Dictation only fills the box —
              the revision still runs on the button below. */}
          <div className="flex flex-wrap items-start gap-2">
            <DictateButton
              value={revisionText}
              onChange={setRevisionText}
              label="Speak the change"
              disabled={!!busy}
            />
            {revisionText.trim() ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => setRevisionText("")}
                disabled={!!busy}
              >
                Clear
              </Button>
            ) : null}
          </div>
          {REVISION_PRESETS.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {REVISION_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() =>
                    setRevisionText(revisionText.trim() ? `${revisionText.trim()} ${preset}` : preset)
                  }
                  disabled={!!busy}
                >
                  {preset}
                </Button>
              ))}
            </div>
          )}
          <Button size="sm" onClick={onRevise} disabled={!!busy || !revisionText.trim()} className="gap-1.5">
            {busy === "revise"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            Apply revision
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Echo rewrites the whole draft, preserving every section you didn't ask to change.
            {version ? ` This becomes version ${version.version_no + 1} — version ${version.version_no} stays readable in Receipts.` : ""}
          </p>
        </Section>
      )}

      <Section icon={<Sparkles className="h-4 w-4" />} title="Ask Echo">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => onAsk("tighten")}>Tighten 30%</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => onAsk("soften")}>Warmer voice</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => onAsk("boardroom")}>Boardroom-formal</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          These open a draft suggestion in Metro Echo — nothing sends until you say so.
        </p>
      </Section>

      <Section icon={<FileDown className="h-4 w-4" />} title="Export draft">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => onExport("operator")} disabled={!!busy}>
            {busy === "export-operator"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            Working copy
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => onExport("client")} disabled={!!busy}>
            {busy === "export-client"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Client-ready
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => onExport("signature")} disabled={!!busy}>
            {busy === "export-signature"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileSignature className="h-3.5 w-3.5" />}
            Signature packet
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => onExportDocx("operator")} disabled={!!busy}>
            {busy === "export-docx"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileText className="h-3.5 w-3.5" />}
            Word (.docx)
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => onExportDocx("client")} disabled={!!busy}>
            <FileText className="h-3.5 w-3.5" />
            Word — client
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => onExportDocx("signature")} disabled={!!busy}>
            <FileSignature className="h-3.5 w-3.5" />
            Word — signature
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          PDF for sharing as-is. Word (.docx) for handing to a lawyer or making further edits. Signature packet adds the "DRAFT — NOT FOR EXECUTION" watermark and a signature page for each named party. Nothing is sent for you.
        </p>
      </Section>



      <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        {DOCUMENT_DISCLAIMER}
      </p>
    </div>
  );
}
