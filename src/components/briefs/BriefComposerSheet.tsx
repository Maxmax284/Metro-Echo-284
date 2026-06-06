// BriefComposerSheet — Draft → Review → Approve & Export.
// Mobile-first bottom sheet. Doctrine: nothing exports without user tap.
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, FileText, Download, Volume2, Pause, Square } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import {
  composeBrief, saveBriefDraft, approveAndExportBrief,
  FORMAT_LABEL, FORMAT_DESCRIPTION,
  type Brief, type BriefFormat, type BriefExportRow,
} from "@/lib/briefs";
import { BriefRenderer } from "./BriefRenderer";
import { BriefPdfDocument } from "./BriefPdfDocument";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultScope: "system" | "entity";
  entityId?: string | null;
  entityLabel?: string | null;
};

const FORMATS: BriefFormat[] = ["operator", "client", "audit_packet", "weekly_review", "audio_script"];

export function BriefComposerSheet({ open, onOpenChange, defaultScope, entityId, entityLabel }: Props) {
  const { scope } = useWorkspace();
  const { toast } = useToast();
  const [format, setFormat] = useState<BriefFormat>("operator");
  const [scopeKind, setScopeKind] = useState<"system" | "entity">(defaultScope);
  const [drafting, setDrafting] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [savedRow, setSavedRow] = useState<BriefExportRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (open) {
      setScopeKind(defaultScope);
      setBrief(null);
      setSavedRow(null);
    } else {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
  }, [open, defaultScope]);

  const orgId = scope.kind === "workspace" ? scope.organization_id : null;

  const scopeBadge = useMemo(() => {
    if (scopeKind === "entity") return entityLabel ?? "Selected entity";
    return "Whole system";
  }, [scopeKind, entityLabel]);

  async function handleDraft() {
    setDrafting(true);
    setBrief(null);
    setSavedRow(null);
    try {
      const b = await composeBrief({
        format,
        scope_kind: scopeKind,
        entity_id: scopeKind === "entity" ? entityId ?? null : null,
      });
      setBrief(b);
      // Persist as draft immediately so review state has an id we can export
      const row = await saveBriefDraft({ brief: b, organization_id: orgId });
      setSavedRow(row);
    } catch (e: any) {
      toast({
        title: "Could not draft brief",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setDrafting(false);
    }
  }

  async function handleApproveExport() {
    if (!brief || !savedRow) return;
    setExporting(true);
    try {
      let pdfBlob: Blob | null = null;
      if (format !== "audio_script") {
        pdfBlob = await pdf(<BriefPdfDocument brief={brief} />).toBlob();
      }
      const updated = await approveAndExportBrief({ row: savedRow, pdfBlob });
      setSavedRow(updated);
      toast({
        title: "Brief exported",
        description: pdfBlob ? "PDF saved to memory uploads." : "Marked as exported.",
      });
      if (pdfBlob) {
        // Offer immediate download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${brief.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  function handlePlayAudio() {
    if (!brief) return;
    const proseSection = brief.sections.find((s) => s.id === "spoken") ?? brief.sections[0];
    const text = typeof proseSection?.body === "string"
      ? proseSection.body
      : brief.sections.map((s) => (typeof s.body === "string" ? s.body : "")).join(" ");
    if (!text) return;
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis?.speak(u);
    setSpeaking(true);
  }

  function handleStopAudio() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto p-0">
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 sm:px-6">
          <SheetHeader className="text-left">
            <SheetTitle className="text-[16px]">Create brief</SheetTitle>
            <SheetDescription className="text-[12px]">
              Vanta drafts the brief. You review. Nothing exports until you approve.
            </SheetDescription>
          </SheetHeader>

          {/* Scope */}
          <div className="mt-4 space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Scope</div>
            <div className="flex flex-wrap gap-2">
              {entityId && (
                <Button
                  size="sm" variant={scopeKind === "entity" ? "default" : "outline"}
                  className="h-8 text-[12px]"
                  onClick={() => setScopeKind("entity")}
                >
                  {entityLabel ?? "This entity"}
                </Button>
              )}
              <Button
                size="sm" variant={scopeKind === "system" ? "default" : "outline"}
                className="h-8 text-[12px]"
                onClick={() => setScopeKind("system")}
              >
                Whole system
              </Button>
              <Badge variant="secondary" className="self-center text-[10px]">{scopeBadge}</Badge>
            </div>
          </div>

          {/* Format */}
          <div className="mt-4 space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Format</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    format === f
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-surface-elevated/40 hover:border-border",
                  )}
                >
                  <div className="text-[13px] font-medium text-foreground">{FORMAT_LABEL[f]}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{FORMAT_DESCRIPTION[f]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Draft / Review */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleDraft} disabled={drafting} className="h-9 gap-1.5">
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {brief ? "Re-draft" : "Draft brief"}
            </Button>
            {brief && format === "audio_script" && (
              <>
                {!speaking ? (
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handlePlayAudio}>
                    <Volume2 className="h-3.5 w-3.5" /> Play
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleStopAudio}>
                    <Square className="h-3.5 w-3.5" /> Stop
                  </Button>
                )}
              </>
            )}
            {brief && (
              <Button
                size="sm" variant="default" className="ml-auto h-9 gap-1.5"
                onClick={handleApproveExport}
                disabled={exporting || savedRow?.status === "exported"}
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {savedRow?.status === "exported" ? "Exported" : "Approve & export"}
              </Button>
            )}
          </div>

          {/* Preview */}
          <div className="mt-4">
            {drafting && !brief && (
              <div className="rounded-md border border-border/50 bg-background/30 p-6 text-center text-[12px] text-muted-foreground">
                Drafting…
              </div>
            )}
            {brief && <BriefRenderer brief={brief} />}
            {!brief && !drafting && (
              <div className="rounded-md border border-dashed border-border/50 p-6 text-center text-[12px] text-muted-foreground">
                Pick a format and tap Draft. Vanta will compose a brief from your most recent linked items and audit receipts.
              </div>
            )}
          </div>

          <p className="mt-3 text-center text-[10.5px] text-muted-foreground">
            Every brief and every export writes an audit receipt. PDFs are stored privately under your account.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
