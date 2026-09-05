// ReceiptsDrawer — opens from a [receipts] chip on a brief claim.
// Lists every audit event, note, file, commitment, or action the claim was
// grounded in. Doctrine: every claim has receipts.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ScrollText, ListChecks, CheckSquare, Inbox, Network } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { resolveReceipts, resolveAuditEvents, type ReceiptRef, type ResolvedReceipt } from "@/lib/receiptResolve";
import { humanizeEvent, kindLabel } from "@/lib/plainLabels";

const ICON_FOR_KIND: Record<string, typeof FileText> = {
  note: FileText, commitment: CheckSquare, action: ListChecks,
  file: FileText, ingested_file: FileText, message: Inbox,
  entity: Network, project: Network,
};

export function ReceiptsDrawer({
  open, onOpenChange, refs, sectionLabel, highlightKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  refs: ReceiptRef[];
  sectionLabel?: string;
  highlightKey?: string;
}) {
  const [items, setItems] = useState<ResolvedReceipt[]>([]);
  const [audit, setAudit] = useState<Array<{ id: string; event: string; entity_type: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const auditRefs = refs.filter((r) => r.kind === "audit" || r.kind === "audit_log");
    const itemRefs = refs.filter((r) => r.kind !== "audit" && r.kind !== "audit_log");
    Promise.all([
      resolveReceipts(itemRefs),
      resolveAuditEvents(auditRefs.map((r) => r.id)),
    ]).then(([resolved, ev]) => {
      setItems(resolved);
      setAudit(ev);
    }).finally(() => setLoading(false));
  }, [open, refs]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-0">
        <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4 sm:px-6">
          <SheetHeader className="text-left">
            <SheetTitle className="text-[15px]">Receipts</SheetTitle>
            <SheetDescription className="text-[12px]">
              {sectionLabel ? <>Backing this claim in <span className="text-foreground/90">{sectionLabel}</span>.</> : "Backing this claim."}{" "}
              Echo only states what these sources contain.
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading receipts…
            </div>
          )}

          {!loading && items.length === 0 && audit.length === 0 && (
            <div className="mt-4 rounded-md border border-dashed border-border/50 p-4 text-center text-[12px] text-muted-foreground">
              No source items recorded for this claim.
            </div>
          )}

          {audit.length > 0 && (
            <section className="mt-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <ScrollText className="h-3 w-3" /> Audit events
              </div>
              <ul className="space-y-1.5">
                {audit.map((a) => (
                  <li key={a.id} className="rounded-md border border-border/40 bg-surface-elevated/40 p-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{humanizeEvent(a.event)}</span>
                      <span className="text-[10.5px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">
                      on a {kindLabel(a.entity_type).toLowerCase()} · recorded automatically when the change happened
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className="mt-4">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Source items
              </div>
              {highlightKey && (
                <div className="mb-2 rounded-md bg-primary/10 px-2 py-1 text-[10.5px] text-primary ring-1 ring-primary/30">
                  Highlighted: exact sources behind the claim you tapped.
                </div>
              )}
              <ul className="space-y-1.5">
                {items.map((it, i) => {
                  const Icon = ICON_FOR_KIND[it.kind] ?? FileText;
                  return (
                    <li
                      key={`${it.kind}-${it.id}-${i}`}
                      className={
                        "flex items-start gap-2 rounded-md border p-2.5 text-[12px] transition-colors " +
                        (highlightKey
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border/40 bg-surface-elevated/40")
                      }
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-foreground/95">{it.label}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <Badge variant="outline" className="text-[9.5px]">{kindLabel(it.kind)}</Badge>
                          {it.when && <span>· {formatDistanceToNow(new Date(it.when), { addSuffix: true })}</span>}
                          {it.detail && <span className="text-warn">· {it.detail}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}


          <p className="mt-4 text-center text-[10.5px] text-muted-foreground">
            Every claim in a Echo brief points back to real items and audit receipts.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
