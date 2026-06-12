// ProjectDocumentsSection — Documents list inside a Project view.
// Lists every documents row attached to this project, shows status, opens
// the DocumentDetailSheet on tap.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSearch, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  listProjectDocuments, kindLabel, statusLabel,
  type DocumentRow,
} from "@/lib/documents";
import { DocumentDetailSheet } from "./DocumentDetailSheet";

interface Props {
  projectId: string;
  /** Bumped by parent to force a refresh after attaching new documents. */
  refreshKey?: number;
}

export function ProjectDocumentsSection({ projectId, refreshKey = 0 }: Props) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listProjectDocuments(projectId));
    } catch {
      setDocs([]);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  if (docs === null) {
    return (
      <section className="mb-6 rounded-2xl border border-border/60 bg-surface-elevated p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
        <p className="mt-1 text-xs text-muted-foreground/70">Loading…</p>
      </section>
    );
  }
  if (docs.length === 0) return null;

  return (
    <section className="mb-6 space-y-3 rounded-2xl border border-border/60 bg-surface-elevated p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
        <span className="text-[10.5px] text-muted-foreground/70">{docs.length} attached</span>
      </div>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setOpenId(d.id)}
              className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40"
            >
              <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{kindLabel(d.kind)}</Badge>
                  <Badge
                    variant={d.status === "failed" ? "destructive" : "outline"}
                    className="text-[10px] capitalize"
                  >
                    {statusLabel(d.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {d.status === "reviewed" ? "Review ready" : "Tap to open"} ·{" "}
                  {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                </p>
              </div>
              {d.status === "reviewed" && (
                <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <DocumentDetailSheet
        documentId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={refresh}
      />
    </section>
  );
}
