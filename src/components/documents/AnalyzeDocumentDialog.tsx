// AnalyzeDocumentDialog — the Documents desk's front door for analysis.
// Stage a file (or several), tap Analyze, and each document-like file is
// filed, converted to a documents row, and read — landing ready for review.
// Same path as the upload card's "Analyze document"; the desk just gets its
// own copy of the door so nobody has to know where files usually live.
import { useMemo, useRef, useState } from "react";
import { Loader2, Upload, FileSearch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StagedFileChips } from "@/components/files/StagedFileChips";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { analyzeIngestedFiles, isDocumentLike } from "@/lib/documents";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

export function AnalyzeDocumentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the document ids that were created and read. */
  onAnalyzed: (docIds: string[]) => void;
}) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const staged = useStagedUpload({ source: "upload" });

  const busy = useMemo(
    () => staged.staged.some((s) => s.status === "uploading" || s.status === "reading"),
    [staged.staged],
  );
  const readyCount = staged.staged.filter((s) => s.status === "staged").length;

  const analyze = async () => {
    if (!user || analyzing) return;
    setAnalyzing(true);
    try {
      const items = await staged.commitAll();
      const saved = items.filter((s) => s.status === "saved" && s.ingestedFileId);
      const docIds = await analyzeIngestedFiles({
        userId: user.id,
        organizationId: orgId,
        files: saved.map((s) => ({ id: s.ingestedFileId!, filename: s.file.name })),
      });
      if (docIds.length === 0) {
        if (saved.length > 0 && !saved.some((s) => isDocumentLike({ filename: s.file.name }))) {
          toast.info("Filed. Nothing document-like among them — PDF, Word or text files can be analyzed.");
        } else {
          toast.error("Couldn't start the analysis — the files are filed in memory.");
        }
        return;
      }
      toast.success(docIds.length === 1 ? "Read and ready for review." : `${docIds.length} documents ready for review.`);
      props.onAnalyzed(docIds);
      props.onOpenChange(false);
    } catch (e) {
      toast.fromError?.(e);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4" /> Analyze document
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Drop a contract, invoice or policy. Echo reads it and lands it here ready for review — nothing is final until you say so.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) staged.stage(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-xs transition-colors",
            drag ? "border-primary bg-accent/40" : "border-muted-foreground/30 hover:border-muted-foreground/50",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
          <span className="text-muted-foreground">
            {busy ? "Working on it…" : "Drop files or click to attach"}
          </span>
          <span className="text-[10px] text-muted-foreground/70">Nothing is analyzed until you tap Analyze · max 20MB</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) staged.stage(e.target.files); e.currentTarget.value = ""; }}
          />
        </div>

        {staged.staged.length > 0 && (
          <div className="space-y-2">
            <StagedFileChips
              items={staged.staged}
              onRemove={staged.remove}
              onRetry={staged.retry}
              onNote={staged.setNote}
            />
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11.5px]"
                onClick={() => props.onOpenChange(false)}
                disabled={analyzing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-[11.5px]"
                onClick={() => void analyze()}
                disabled={analyzing || busy || readyCount === 0}
              >
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />}
                {analyzing ? "Reading…" : "Analyze"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
