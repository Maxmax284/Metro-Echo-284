// CrossRefCasesPanel — the desk where sources read together live on.
// A cross-reference is not a moment in a chat: it is a case with sources,
// readings, conflicts and (once you tap) a document. This panel lists the
// cases in the current lane and reopens any of them exactly where you left it.
//
// Doctrine: reading is not deciding. Nothing here composes, exports or sends.
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Layers, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState } from "@/components/ui/state-views";
import { StatusDot } from "@/components/ui/status-dot";
import { vantaToast } from "@/lib/vantaVoice";
import { useScope } from "@/hooks/useScope";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { listCases, recipeById, runCrossReference, type CaseRow } from "@/lib/crossref";
import { CrossRefReviewSheet } from "./CrossRefReviewSheet";
import { SuggestedReadingCard } from "./SuggestedReadingCard";

const STATUS_LINE: Record<string, string> = {
  draft: "Sources attached, not read yet",
  reading: "Vanta is reading the sources",
  matrix_ready: "Read — waiting on your review",
  reviewed: "Reviewed — no document built yet",
  composed: "Document built and filed in Receipts",
  failed: "Reading failed — nothing was filed",
};

function ago(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function CrossRefCasesPanel() {
  const scope = useScope();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { stage, commitAll } = useStagedUpload({ source: "upload" });

  const load = useCallback(async () => {
    try {
      setCases(await listCases(scope.scope, 8));
    } catch {
      setCases([]);
    }
  }, [scope.scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length < 2) {
      vantaToast({
        title: "Pick at least two sources",
        description: "Cross-reference needs something to compare against.",
      });
      return;
    }
    setBusy(true);
    try {
      stage(files);
      const settled = await commitAll();
      const ids = settled.filter((s) => s.ingestedFileId).map((s) => s.ingestedFileId!);
      if (ids.length < 2) {
        vantaToast.error({
          title: "Only one source could be read",
          description: "Nothing was cross-referenced. The files stay in Memory.",
        });
        return;
      }
      const res = await runCrossReference({
        ingested_file_ids: ids.slice(0, 12),
        organization_id: scope.isOrganization ? scope.orgId : null,
      });
      setOpenId(res.case_id);
      void load();
    } catch {
      vantaToast.error({
        title: "Could not read those together",
        description: "Nothing was filed. Try again with fewer sources.",
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="vanta-card p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-medium">
            <Layers className="h-3.5 w-3.5 text-primary/80" />
            Sources read together
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            Two or more documents about the same thing. Vanta lines them up field by
            field, says where they disagree, and waits for you before building anything.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {busy ? "Reading" : "Read together"}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      <SuggestedReadingCard onStarted={() => void load()} />

      {cases === null ? (
        <LoadingState label="Looking for cases" />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases yet — a case appears when you attach two or more sources here or in Ask."
          hint="A fight card and its registration sheets, a contract and its invoice, a manifest and its bookings."
        />
      ) : (
        <div className="space-y-1.5">
          {cases.map((c) => {
            const recipe = recipeById(c.style);
            return (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="flex w-full items-start gap-2 rounded-lg surface-elevated p-2.5 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
              >
                <StatusDot tone={c.status === "composed" ? "primary" : c.status === "failed" ? "destructive" : "muted"} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{c.title || "Cross-reference"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {STATUS_LINE[c.status] ?? c.status} · {ago(c.updated_at || c.created_at)}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{recipe.label}</Badge>
              </button>
            );
          })}
        </div>
      )}

      {openId && (
        <CrossRefReviewSheet
          caseId={openId}
          open
          onOpenChange={(v) => {
            if (!v) {
              setOpenId(null);
              void load();
            }
          }}
        />
      )}
    </div>
  );
}
