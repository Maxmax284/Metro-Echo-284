// BriefExportsList — past briefs for an entity or for the system.
//
// Phase 4 addition: research_brief rows (drafts without a PDF) render inline
// with an expandable plain-English view + source list, so the Living Brief
// surface can reference outside research without a new panel or new tab.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, Telescope, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { listBriefExports, getBriefDownloadUrl, FORMAT_LABEL, type BriefExportRow } from "@/lib/briefs";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type ResearchSource = { position?: number; title?: string; url?: string; snippet?: string; provider?: string };
type ResearchSection = { id?: string; heading?: string; body?: string };

export function BriefExportsList({ entityId, projectId }: { entityId?: string | null; projectId?: string | null }) {
  const [rows, setRows] = useState<BriefExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
      const filename = `${(row.title || "brief").replace(/[^\w.-]+/g, "_")}.pdf`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
      } catch {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
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

  const pdfRows = rows.filter((r) => !!r.storage_path);
  // Research briefs are drafts without a PDF — surface them anyway with an
  // inline read view so the Living Brief can reference outside research.
  const researchRows = rows.filter((r) => !r.storage_path && r.format === "research_brief");
  const otherDrafts = rows.filter((r) => !r.storage_path && r.format !== "research_brief");

  if (pdfRows.length === 0 && researchRows.length === 0) {
    if (otherDrafts.length > 0) {
      return (
        <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-[12px] text-muted-foreground">
          <div className="text-foreground/85">Living Brief updated. No PDF exports yet.</div>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-[12px] text-muted-foreground">
        <div className="text-foreground/85">No exported briefs yet.</div>
        <div className="mt-1">Draft summaries stay in the Living Brief until you approve an export.</div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {researchRows.map((r) => {
        const isOpen = expanded === r.id;
        const doc = (r.brief ?? {}) as any;
        const sections: ResearchSection[] = Array.isArray(doc.sections) ? doc.sections : [];
        const sources: ResearchSource[] = Array.isArray(doc.sources) ? doc.sources : [];
        return (
          <li
            key={r.id}
            className="rounded-md border border-border/50 bg-surface-elevated/40 p-3"
          >
            <div className="flex items-start gap-3">
              <Telescope className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-foreground">{r.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span>Outside research</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  {sources.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
                    </>
                  )}
                  <Badge variant="secondary" className="text-[9.5px]">attached</Badge>
                </div>
                {r.subtitle && (
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.subtitle}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[11px]"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? "Hide research brief" : "Read research brief"}
              >
                {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                <span className="hidden sm:inline">{isOpen ? "Hide" : "Read"}</span>
              </Button>
            </div>
            {isOpen && (
              <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                {sections.map((s, i) => (
                  <div key={s.id || i}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {s.heading || "Section"}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-foreground/90">
                      {s.body || "—"}
                    </div>
                  </div>
                ))}
                {sources.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      Sources
                    </div>
                    <ul className="mt-1 space-y-1">
                      {sources.map((s, i) => (
                        <li key={i} className="text-[11.5px]">
                          <a
                            href={s.url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-start gap-1 text-primary hover:underline"
                          >
                            <span className="text-muted-foreground">[{i + 1}]</span>
                            <span className="line-clamp-1">{s.title || s.url}</span>
                            <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                          </a>
                          {s.snippet && (
                            <div className="line-clamp-2 pl-5 text-[10.5px] text-muted-foreground">{s.snippet}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}

      {pdfRows.map((r) => (
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
