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
  AlertTriangle, BookOpen, Calendar, Coins, FileSearch, FileDown,
  HelpCircle, Loader2, MessageSquareWarning, RefreshCcw, Send, Sparkles,
  ShieldAlert, Users,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  DOCUMENT_DISCLAIMER, getDocument, getLatestReview, kindLabel,
  runExtraction, runReview, statusLabel,
  type DocumentObligation, type DocumentReview, type DocumentRisk, type DocumentRow,
} from "@/lib/documents";
import {
  finalizeDocumentExport, saveDocumentExportDraft,
  type DocumentExportAudience,
} from "@/lib/documentExport";
import { BriefPdfDocument } from "@/components/briefs/BriefPdfDocument";
import { useCompanion } from "@/components/companion/CompanionContext";

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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "extract" | "review" | "export-operator" | "export-client">(null);
  const { openWithPrefill } = useCompanion();

  const refresh = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const d = await getDocument(documentId);
      setDoc(d);
      const { review, risks, obligations } = await getLatestReview(documentId);
      setReview(review);
      setRisks(risks);
      setObligations(obligations);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open && documentId) void refresh();
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

  async function handleExport(audience: DocumentExportAudience) {
    if (!documentId) return;
    setBusy(audience === "client" ? "export-client" : "export-operator");
    try {
      const { row, brief, doc: docRow } = await saveDocumentExportDraft({
        document_id: documentId, audience,
      });
      const pdfBlob = await pdf(<BriefPdfDocument brief={brief} />).toBlob();
      await finalizeDocumentExport({
        row, pdfBlob, document_id: docRow.id, audience,
      });
      const url = URL.createObjectURL(pdfBlob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${brief.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(audience === "client"
        ? "Client packet exported."
        : "Operator packet exported.");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function handleAsk(kind: "explain-risk" | "before-signing" | "money") {
    if (!doc) return;
    const map: Record<typeof kind, string> = {
      "explain-risk":
        `For the document "${doc.title}", walk me through the highest-severity risks in plain English. What would each one mean for me in practice? No legal advice — just help me understand.`,
      "before-signing":
        `Before I sign "${doc.title}", what should I ask the other side? Use the review Vanta already produced. Draft the questions as a short list I can send.`,
      "money":
        `Summarize the money terms in "${doc.title}" — fees, deposits, late charges, refunds, who pays when. Plain English, no legal interpretation.`,
    };
    openWithPrefill(map[kind]);
    onOpenChange(false);
  }


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto pb-32 sm:max-w-2xl">
        {!doc || loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
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
              {(doc.status === "uploaded" || doc.status === "failed") && (
                <Button size="sm" onClick={handleExtract} disabled={!!busy} className="gap-1.5">
                  {busy === "extract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  Read document
                </Button>
              )}
              {(doc.status === "extracted" || doc.status === "reviewed" || doc.status === "failed") && (
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
            </div>

            {review ? (
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

                {obligations.length > 0 && (
                  <Section icon={<AlertTriangle className="h-4 w-4" />} title="Obligations">
                    <ul className="space-y-2 text-sm">
                      {obligations.map((o) => (
                        <li key={o.id} className="rounded-md border border-border/60 bg-surface-elevated p-2.5">
                          <div className="font-medium">{o.party ?? "Party"}</div>
                          <div className="text-foreground/85">{o.what ?? ""}</div>
                          {(o.when_text || o.conditions) && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {o.when_text && <span>When: {o.when_text}</span>}
                              {o.when_text && o.conditions && <span> · </span>}
                              {o.conditions && <span>If: {o.conditions}</span>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

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

                <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {DOCUMENT_DISCLAIMER}
                </p>

                <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
                  <span>Reviewed {formatDistanceToNow(new Date(review.generated_at), { addSuffix: true })}</span>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleReview} disabled={!!busy}>
                    <RefreshCcw className="h-3.5 w-3.5" /> Re-review
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                {doc.status === "uploaded" && "Tap Read document to extract its text. Vanta won't run AI until you tap."}
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
