// SuggestedReadingCard — Echo noticing that sources already in hand look
// related, and offering to read them together.
//
// Doctrine: noticing is free, reading is not. The pairing is deterministic
// (filenames and arrival times, no model), and the reading only starts when
// you tap. Nothing is filed, exported or sent from here.
import { useCallback, useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { ProvenanceStrip } from "@/components/ui/provenance";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast } from "@/lib/vantaVoice";
import { proposeReading, type PairProposal, type ReadableSource } from "@/lib/crossrefPairs";
import { runCrossReference } from "@/lib/crossref";
import { CrossRefReviewSheet } from "./CrossRefReviewSheet";

export function SuggestedReadingCard({ onStarted }: { onStarted?: () => void }) {
  const scope = useScope();
  const [proposal, setProposal] = useState<PairProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    const res = await scope
      .applyScope(
        supabase
          .from("ingested_files")
          .select("id, filename, mime_type, source, created_at, extracted_text"),
      )
      .order("created_at", { ascending: false })
      .limit(24);
    if (res.error) {
      setProposal(null);
      return;
    }
    const pool: ReadableSource[] = (res.data ?? []).map((f) => ({
      id: f.id,
      filename: f.filename ?? "",
      mime_type: f.mime_type,
      source: f.source,
      created_at: f.created_at,
      readable: Boolean(f.extracted_text && String(f.extracted_text).trim().length > 20),
    }));
    setProposal(proposeReading(pool));
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!proposal || dismissed) return null;

  const start = async () => {
    setBusy(true);
    try {
      const res = await runCrossReference({
        ingested_file_ids: proposal.fileIds,
        title: proposal.filenames[0] ?? "Cross-reference",
        organization_id: scope.isOrganization ? scope.orgId : null,
      });
      setCaseId(res.case_id);
      onStarted?.();
    } catch (e) {
      vantaToast.error({
        title: "Didn't run.",
        description:
          e instanceof Error ? e.message : "The reading could not start. Nothing else changed — the sources stay as they are.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vanta-card p-4">
      <div className="flex items-start gap-3">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <MachineLabel>Suggested reading</MachineLabel>
          <p className="mt-1 text-sm leading-snug text-foreground">
            {proposal.signal === "same_name"
              ? `${proposal.fileIds.length} sources look like the same thing and have never been read side by side.`
              : `${proposal.fileIds.length} sources could be read against each other.`}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{proposal.reason}</p>
          <ul className="mt-2 space-y-0.5">
            {proposal.filenames.map((name, i) => (
              <li key={`${name}-${i}`} className="truncate text-xs text-muted-foreground">
                {name}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProvenanceStrip source="sherlock" at={proposal.at} />
            <p className="text-[11px] text-muted-foreground">Nothing has been read yet.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-8" onClick={start} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? "Reading the sources" : "Read them together"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDismissed(true)} disabled={busy}>
              Not related
            </Button>
          </div>
        </div>
      </div>
      <CrossRefReviewSheet caseId={caseId} open={Boolean(caseId)} onOpenChange={(o) => !o && setCaseId(null)} />
    </div>
  );
}
