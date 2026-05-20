import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEntitySheet } from "./EntityContext";
import { cn } from "@/lib/utils";
import { AtSign, Hash, Link2, MapPin, Tag, Calendar, Box, User } from "lucide-react";
import type { EntitySourceKind } from "@/lib/entityGraph";

type Row = {
  id: string;
  entity_id: string;
  entities: { id: string; kind: string; display_name: string } | null;
};

const KIND_ICON = {
  person: User,
  place: MapPin,
  org: Box,
  topic: Hash,
  thing: Link2,
  event: Calendar,
} as const;

function pickIcon(kind: string, name: string) {
  if (name?.startsWith("@")) return AtSign;
  if (name?.startsWith("#")) return Hash;
  return (KIND_ICON as any)[kind] ?? Tag;
}

/**
 * EntityChips — reads `entity_links` for a given source and renders tappable
 * chips. Tapping opens the global EntityDetailSheet via EntityContext.
 * Read-only on this pass; no add/remove yet (write-path is automatic).
 */
export function EntityChips({
  sourceKind,
  sourceId,
  max = 6,
  className,
}: {
  sourceKind: EntitySourceKind;
  sourceId: string;
  max?: number;
  className?: string;
}) {
  const { openEntity } = useEntitySheet();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("entity_links")
        .select("id, entity_id, entities ( id, kind, display_name )")
        .eq("source_kind", sourceKind)
        .eq("source_id", sourceId)
        .limit(20);
      if (alive) setRows(((data ?? []) as unknown) as Row[]);
    })();
    return () => { alive = false; };
  }, [sourceKind, sourceId]);

  if (rows.length === 0) return null;
  const visible = rows.slice(0, max);
  const extra = rows.length - visible.length;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {visible.map((r) => {
        if (!r.entities) return null;
        const Icon = pickIcon(r.entities.kind, r.entities.display_name);
        return (
          <button
            key={r.id}
            onClick={(e) => { e.stopPropagation(); openEntity(r.entity_id); }}
            className="inline-flex max-w-[160px] items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/40 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            title={`${r.entities.kind} · ${r.entities.display_name}`}
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{r.entities.display_name}</span>
          </button>
        );
      })}
      {extra > 0 && (
        <span className="inline-flex items-center rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}
