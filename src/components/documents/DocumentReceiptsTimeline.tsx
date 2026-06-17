// DocumentReceiptsTimeline — Phase 7 Tooling Addendum gap #2.
// Per-document, plain-English receipts surfaced as a small inline timeline
// inside DocumentDetailSheet. Reads existing audit_log rows scoped to this
// document (entity_type = "document"). No new tables, no new writes — just
// surfacing what's already there.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Receipt } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { humanizeEvent } from "@/lib/plainLabels";

interface AuditRow {
  id: string;
  event: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export function DocumentReceiptsTimeline({ documentId }: { documentId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("audit_log")
        .select("id, event, created_at, payload")
        .eq("entity_type", "document")
        .eq("entity_id", documentId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled) {
        setRows((data ?? []) as AuditRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading receipts…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No receipts yet for this document.</p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-start gap-2 rounded-md border border-border/40 bg-surface-elevated/40 p-2 text-xs"
        >
          <Receipt className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
          <div className="min-w-0 flex-1">
            <div className="text-foreground/90">{humanizeEvent(r.event)}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
