import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Upload, FileText, FileSearch, Search, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { analyzeIngestedFiles, isDocumentLike } from "@/lib/documents";
import { useActiveOrgId } from "@/hooks/useScope";
import { formatDistanceToNow } from "date-fns";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { StatusDot, ingestStatusTone } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { StagedFileChips } from "@/components/files/StagedFileChips";
import { FileAftermathTray } from "@/components/files/FileAftermathTray";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { useSharedTargetIntake } from "@/hooks/useSharedTargetIntake";
import { VANTA_STAGE_FILES_EVENT, type VantaStageFilesDetail } from "@/components/files/GlobalDropZone";

type Row = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  source: string;
  note_id: string | null;
  error: string | null;
  created_at: string;
};

export function FileUploadCard() {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const [trays, setTrays] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const { data } = await supabase
      .from("ingested_files")
      .select("id,filename,mime_type,size_bytes,status,source,note_id,error,created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { refresh(); }, []);

  const staged = useStagedUpload({
    source: "upload",
    onSaved: (s) => {
      if (s.ingestedFileId) {
        setTrays((prev) => (prev.includes(s.ingestedFileId!) ? prev : [s.ingestedFileId!, ...prev]).slice(0, 3));
      }
      void refresh();
    },
  });

  // PWA share target: drain any files the OS share sheet handed us into staging.
  // Tag them with source="share" so CaptureToast labels them distinctly and the
  // audit trail shows the true origin.
  useSharedTargetIntake((files, ctx) => {
    if (files.length > 0) {
      const keys = staged.stage(files, { sourceOverride: "share" });
      if (ctx.text || ctx.url) {
        const note = [ctx.text, ctx.url].filter(Boolean).join(" · ").slice(0, 280);
        for (const k of keys) staged.setNote(k, note);
      }
      toast.success(`${files.length} file${files.length === 1 ? "" : "s"} shared in. Review them, then file.`);
    }
  });

  // Global desktop drop zone: any file dropped on the window stages here.
  // Tagged source="drop" so the audit trail distinguishes it from picker uploads.
  useEffect(() => {
    const onStage = (e: Event) => {
      const detail = (e as CustomEvent<VantaStageFilesDetail>).detail;
      if (!detail?.files?.length) return;
      staged.stage(detail.files, { sourceOverride: detail.source });
      toast.success(`${detail.files.length} file${detail.files.length === 1 ? "" : "s"} staged. Review, then file.`);
    };
    window.addEventListener(VANTA_STAGE_FILES_EVENT, onStage);
    return () => window.removeEventListener(VANTA_STAGE_FILES_EVENT, onStage);
  }, [staged]);

  const busy = useMemo(
    () => staged.staged.some((s) => s.status === "uploading" || s.status === "reading"),
    [staged.staged],
  );

  const counts = useMemo(() => {
    const c = { done: 0, pending: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === "done") c.done++;
      else if (r.status === "failed" || r.status === "error") c.failed++;
      else c.pending++;
    }
    return c;
  }, [rows]);

  const handleCommit = async () => {
    setConfirmOpen(false);
    await staged.commitAll();
  };

  /* Analyze document — same staged files, but filed straight into the
     Documents desk with the read already run. Sits next to "File these"
     because both are ways to give a staged file its next life. */
  const navigate = useNavigate();
  const orgId = useActiveOrgId();
  const [analyzing, setAnalyzing] = useState(false);
  const analyzeStaged = async () => {
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
          toast.error("Couldn't start the analysis — the files are filed, try Analyze from the tray below.");
        }
        return;
      }
      toast.success(docIds.length === 1 ? "Read and ready for review." : `${docIds.length} documents ready for review.`);
      navigate(docIds.length === 1 ? `/documents?document=${docIds[0]}` : "/documents");
    } catch (e) {
      toast.fromError?.(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const stagedCount = staged.staged.filter((s) => s.status === "staged").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Files into memory</CardTitle>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {rows.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
              <StatusDot tone="primary" /> {counts.done} done
            </span>
            {counts.pending > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
                <StatusDot tone="accent" pulse /> {counts.pending} being read
              </span>
            )}
            {counts.failed > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
                <StatusDot tone="destructive" /> {counts.failed} failed
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
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
          <span className="text-[10px] text-muted-foreground/70">Nothing is filed until you confirm · max 20MB</span>
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
              showNoteInput
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={staged.clearCompleted}
                disabled={busy || !staged.staged.some((s) => s.status === "saved")}
              >
                Clear saved
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || !staged.staged.some((s) => s.status === "staged")}
              >
                {busy ? "Reading…" : "File these"}
              </Button>
            </div>
          </div>
        )}

        {trays.length > 0 && (
          <div className="space-y-2">
            {trays.map((id) => (
              <FileAftermathTray
                key={id}
                ingestedFileId={id}
                onDismiss={() => setTrays((prev) => prev.filter((x) => x !== id))}
              />
            ))}
          </div>
        )}

        <div className="space-y-1">
          {rows.length === 0 && staged.staged.length === 0 && (
            <p className="rounded-md border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground">
              {vantaSay.empty.files()}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border border-border/40 p-2 text-xs">
              <FileText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.filename}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <StatusDot tone={ingestStatusTone(r.status)} pulse={r.status !== "done" && r.status !== "failed" && r.status !== "error"} />
                    {r.status}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{r.source}</span>
                  <span aria-hidden>·</span>
                  <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  {r.error && <span className="text-destructive">· {r.error}</span>}
                </div>
              </div>
              {r.note_id && r.status === "done" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] gap-1"
                  title="Investigate with Sherlock"
                  onClick={async () => {
                    const { data: note } = await supabase
                      .from("notes")
                      .select("id, title, body")
                      .eq("id", r.note_id!)
                      .maybeSingle();
                    if (!note) { toast.error(vantaSay.notFound("Note")); return; }
                    openSherlock({
                      entity_type: "file",
                      entity_id: note.id,
                      title: note.title ?? r.filename,
                      text: note.body ?? "",
                    });
                  }}
                >
                  <Search className="h-3 w-3" /> Investigate
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File {stagedCount} {stagedCount === 1 ? "thing" : "things"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Echo will save and read the staged file{stagedCount === 1 ? "" : "s"} into memory. Nothing is final — you can review the result afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCommit}>File them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
