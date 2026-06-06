// receiptResolve — resolves a {kind,id} grounding pointer used in briefs
// into a label + route into the right surface. Best-effort: missing items
// degrade gracefully (label = id prefix).
import { supabase } from "@/integrations/supabase/client";
import { kindLabel } from "@/lib/plainLabels";

export type ReceiptRef = { kind: string; id: string; label?: string | null };

export type ResolvedReceipt = {
  kind: string;
  id: string;
  label: string;
  detail?: string | null;
  when?: string | null;
  surface: "memory" | "actions" | "commitments" | "audit" | "sherlock" | "canvas" | null;
};

const TABLE_FOR_KIND: Record<string, { table: string; label_col: string; time_col: string }> = {
  note:          { table: "notes",            label_col: "title",   time_col: "updated_at" },
  commitment:    { table: "commitments",      label_col: "summary", time_col: "updated_at" },
  action:        { table: "actions",          label_col: "title",   time_col: "updated_at" },
  file:          { table: "ingested_files",   label_col: "filename",time_col: "created_at" },
  ingested_file: { table: "ingested_files",   label_col: "filename",time_col: "created_at" },
  message:       { table: "messages",         label_col: "content", time_col: "created_at" },
  entity:        { table: "entities",         label_col: "display_name", time_col: "last_seen_at" },
  project:       { table: "entities",         label_col: "display_name", time_col: "last_seen_at" },
};

const SURFACE_FOR_KIND: Record<string, ResolvedReceipt["surface"]> = {
  note: "memory", commitment: "commitments", action: "actions",
  file: "memory", ingested_file: "memory", message: "memory",
  entity: "canvas", project: "canvas",
  audit_log: "audit", audit: "audit",
  sherlock_finding: "sherlock",
  brief: "audit", brief_export: "audit",
};

export async function resolveReceipts(refs: ReceiptRef[]): Promise<ResolvedReceipt[]> {
  if (!refs?.length) return [];
  // Group by table for efficient fetch.
  const byTable = new Map<string, ReceiptRef[]>();
  for (const r of refs) {
    if (!r?.id) continue;
    const cfg = TABLE_FOR_KIND[r.kind];
    if (!cfg) continue;
    const arr = byTable.get(cfg.table) ?? [];
    arr.push(r); byTable.set(cfg.table, arr);
  }

  const lookup = new Map<string, { label: string; when?: string | null }>();
  await Promise.all(Array.from(byTable.entries()).map(async ([table, items]) => {
    const cfg = Object.values(TABLE_FOR_KIND).find((c) => c.table === table)!;
    const ids = Array.from(new Set(items.map((i) => i.id)));
    const { data } = await supabase
      .from(table as any)
      .select(`id, ${cfg.label_col}, ${cfg.time_col}`)
      .in("id", ids);
    for (const row of (data ?? []) as any[]) {
      const raw = String(row[cfg.label_col] ?? "");
      lookup.set(`${table}:${row.id}`, {
        label: raw.length > 80 ? raw.slice(0, 77) + "…" : raw || "(no label)",
        when: row[cfg.time_col] ?? null,
      });
    }
  }));

  return refs.map((r) => {
    const cfg = TABLE_FOR_KIND[r.kind];
    const hit = cfg ? lookup.get(`${cfg.table}:${r.id}`) : null;
    return {
      kind: r.kind,
      id: r.id,
      label: hit?.label ?? r.label ?? `${kindLabel(r.kind)} ${r.id.slice(0, 8)}`,
      detail: hit ? null : "Not found (may have been removed)",
      when: hit?.when ?? null,
      surface: SURFACE_FOR_KIND[r.kind] ?? null,
    };
  });
}

// Audit events are referenced by their audit_log row id. Resolve a batch by id.
export async function resolveAuditEvents(ids: string[]): Promise<Array<{
  id: string; event: string; entity_type: string; entity_id: string | null; created_at: string;
}>> {
  if (!ids?.length) return [];
  const { data } = await supabase
    .from("audit_log")
    .select("id, event, entity_type, entity_id, created_at")
    .in("id", ids);
  return (data ?? []) as any[];
}
