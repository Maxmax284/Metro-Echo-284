// CrossRefChip — the only discoverable entry point for cross-reference.
// It shows up when two or more readable sources are sitting on the composer,
// in Ask and in the widget alike (both render ConversationSurface).
// Tapping reads the sources once and opens the review sheet. It never sends,
// files, or executes anything on its own.
import { useState } from "react";
import { Layers } from "lucide-react";
import { vantaToast } from "@/lib/vantaVoice";
import { useScope } from "@/hooks/useScope";
import { runCrossReference } from "@/lib/crossref";
import { CrossRefReviewSheet } from "./CrossRefReviewSheet";

export type CrossRefSource = { name: string; ingestedFileId?: string | null };

/** Readable enough to cross-reference: images, PDFs, text-ish documents. */
export function readableForCrossRef(items: { name: string; type?: string }[]): number {
  return items.filter((i) => {
    const t = (i.type ?? "").toLowerCase();
    const n = i.name.toLowerCase();
    if (t.startsWith("image/")) return true;
    if (t.includes("pdf") || n.endsWith(".pdf")) return true;
    if (t.startsWith("text/") || /\.(txt|md|csv|json|docx?)$/.test(n)) return true;
    return false;
  }).length;
}

export function CrossRefChip({
  sources, threadId, requestText,
}: {
  sources: CrossRefSource[];
  threadId?: string | null;
  requestText?: string;
}) {
  const scope = useScope();
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const ready = sources.filter((s) => s.ingestedFileId);
  if (sources.length < 2) return null;

  const run = async () => {
    if (ready.length < 2) {
      vantaToast({
        title: "Ingest the files first",
        description: "Echo reads them once, then cross-references. Tap Ingest staged.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await runCrossReference({
        ingested_file_ids: ready.map((s) => s.ingestedFileId!).slice(0, 12),
        request: requestText,
        thread_id: threadId ?? null,
        organization_id: scope.isOrganization ? scope.orgId : null,
      });
      setCaseId(res.case_id);
      setOpen(true);
    } catch {
      vantaToast.error({
        title: "Could not read those together",
        description: "Nothing was filed. Try again, or attach fewer sources.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium">{sources.length} sources arrived together</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Echo can line them up and show you what does not match.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Layers className="h-3.5 w-3.5" />
          {busy ? "Reading" : "Cross-reference"}
        </button>
      </div>

      <CrossRefReviewSheet caseId={caseId} open={open} onOpenChange={setOpen} />
    </>
  );
}
