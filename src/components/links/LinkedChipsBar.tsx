// LinkedChipsBar — shows all active cross_links for one item (both
// directions), as compact chips. Tap to open in a detail dialog;
// long-press / overflow menu unlinks (writes `link.removed`).
//
// Doctrine: chips are reversible. Every chip can be removed.
import { useEffect, useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listCrossLinksForItem, removeCrossLink, KIND_LABEL,
  type CrossKind, type CrossLinkRow,
} from "@/lib/crossLinks";
import { vantaToast as toast } from "@/lib/vantaVoice";

const RELATION_TONE: Record<string, string> = {
  related: "border-border/60 bg-surface-elevated/40 text-muted-foreground",
  about: "border-primary/30 bg-primary/10 text-primary",
  part_of: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  blocks: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  duplicate_of: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
};

export function LinkedChipsBar({
  source,
  refreshKey,
  onChange,
  onOpenItem,
  compact = true,
}: {
  source: { kind: CrossKind; id: string };
  /** Bump this to force a refetch after creating a new link. */
  refreshKey?: number;
  onChange?: () => void;
  onOpenItem?: (kind: CrossKind, id: string) => void;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<CrossLinkRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!source.id) return;
    const data = await listCrossLinksForItem(source.kind, source.id);
    setRows(data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [source.kind, source.id, refreshKey]);

  const unlink = async (row: CrossLinkRow) => {
    setBusyId(row.id);
    const ok = await removeCrossLink(row.id);
    setBusyId(null);
    if (ok) {
      toast.message({ title: "Unlinked." });
      onChange?.();
      load();
    }
  };

  /* Nothing to show is not news. An unlinked item says nothing here — the
     Attach control on the same card already teaches the move, and printing a
     second "not connected yet" line made every capture read twice as loud. */
  if (rows === null || rows.length === 0) return null;


  return (
    <div className={cn("flex flex-wrap items-center gap-1", compact && "text-[11px]")}>
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-2.5 w-2.5" /> Linked
      </span>
      {rows.map((r) => {
        const label = r.other_label ?? `${KIND_LABEL[r.other_kind]} ${r.other_id.slice(0, 6)}`;
        const tone = RELATION_TONE[r.relation] ?? RELATION_TONE.related;
        const relLabel = r.relation === "related" ? "" : ` · ${r.relation.replace("_", " ")}`;
        return (
          <span
            key={r.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]",
              tone,
            )}
            title={`${KIND_LABEL[r.other_kind]} · ${r.relation}${r.reason ? ` · ${r.reason}` : ""}`}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenItem?.(r.other_kind, r.other_id); }}
              className="truncate max-w-[140px] hover:underline"
            >
              {label}{relLabel}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); unlink(r); }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              aria-label={`Unlink ${label}`}
              disabled={busyId === r.id}
            >
              {busyId === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
            </button>
          </span>
        );
      })}
    </div>
  );
}
