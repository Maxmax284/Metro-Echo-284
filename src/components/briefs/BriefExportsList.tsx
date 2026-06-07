// BriefExportsList — past briefs for an entity or for the system.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2 } from "lucide-react";
import { listBriefExports, getBriefDownloadUrl, FORMAT_LABEL, type BriefExportRow } from "@/lib/briefs";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export function BriefExportsList({ entityId, projectId }: { entityId?: string | null; projectId?: string | null }) {
  const [rows, setRows] = useState<BriefExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBriefExports({ entity_id: entityId ?? undefined, project_id: projectId ?? undefined })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { /* noop */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityId, projectId]);

  async function download(row: BriefExportRow) {
    if (!row.storage_path) return;
    setDownloading(row.id);
    try {
      const url = await getBriefDownloadUrl(row.storage_path);
      if (!url) throw new Error("Could not create download link");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading briefs…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-[12px] text-muted-foreground">
        <div className="text-foreground/85">No exports yet.</div>
        <div className="mt-1">Drafts stay private. Tap <span className="text-foreground/90">Create brief</span> → review → <span className="text-foreground/90">Approve &amp; export</span>. The PDF will appear here and you can re-download anytime.</div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-start gap-3 rounded-md border border-border/50 bg-surface-elevated/40 p-3"
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-foreground">{r.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span>{FORMAT_LABEL[r.format]}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
              <Badge
                variant={r.status === "exported" ? "default" : "secondary"}
                className="text-[9.5px]"
              >
                {r.status}
              </Badge>
            </div>
          </div>
          {r.storage_path && (
            <Button
              size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
              onClick={() => download(r)} disabled={downloading === r.id}
            >
              {downloading === r.id
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Download className="h-3 w-3" />}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
