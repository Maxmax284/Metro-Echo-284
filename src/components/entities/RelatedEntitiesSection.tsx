// Phase 5 — Related entities section. Pure read of `entity_relations` for the
// open entity, both directions, ranked by evidence_count. Tap to open the
// related entity. Approval-first: low-evidence relations are flagged for
// review; user can confirm or dismiss without auto-mutating the graph.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEntitySheet } from "./EntityContext";
import { Loader2, Check, X, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vantaSay } from "@/lib/vantaVoice";

type RelRow = {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relation: string;
  evidence_count: number;
  last_evidence_at: string;
};

type EntityLite = { id: string; display_name: string; kind: string };

export function RelatedEntitiesSection({ entityId }: { entityId: string }) {
  const { user } = useAuth();
  const { openEntity } = useEntitySheet();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<RelRow & { other: EntityLite }>>([]);

  const load = async () => {
    if (!user || !entityId) return;
    setLoading(true);
    const { data: rels } = await supabase
      .from("entity_relations")
      .select("id, from_entity_id, to_entity_id, relation, evidence_count, last_evidence_at")
      .eq("user_id", user.id)
      .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`)
      .order("evidence_count", { ascending: false })
      .limit(40);
    const list = (rels ?? []) as RelRow[];
    const otherIds = Array.from(
      new Set(list.map((r) => (r.from_entity_id === entityId ? r.to_entity_id : r.from_entity_id))),
    );
    let nameMap = new Map<string, EntityLite>();
    if (otherIds.length) {
      const { data: ents } = await supabase
        .from("entities")
        .select("id, display_name, kind")
        .in("id", otherIds);
      for (const e of (ents ?? []) as EntityLite[]) nameMap.set(e.id, e);
    }
    setRows(
      list
        .map((r) => {
          const otherId = r.from_entity_id === entityId ? r.to_entity_id : r.from_entity_id;
          const other = nameMap.get(otherId);
          return other ? { ...r, other } : null;
        })
        .filter(Boolean) as Array<RelRow & { other: EntityLite }>,
    );
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, entityId]);

  const confirm = async (id: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("entity_relations")
      .select("evidence_count")
      .eq("id", id)
      .maybeSingle();
    const next = Math.max(2, (data?.evidence_count ?? 1) + 1);
    await supabase.from("entity_relations").update({
      evidence_count: next,
      last_evidence_at: new Date().toISOString(),
    }).eq("id", id);
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "entity_relation",
      event: "entity_relation.confirmed",
      entity_id: id,
      payload: { evidence_count: next },
    });
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, evidence_count: next } : r)));
  };

  const dismiss = async (id: string) => {
    if (!user) return;
    await supabase.from("entity_relations").delete().eq("id", id);
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "entity_relation",
      event: "entity_relation.dismissed",
      entity_id: id,
    });
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <div className="mt-5 py-4 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Network className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Related entities
          </p>
        </div>
        <span className="text-[10.5px] text-muted-foreground">{vantaSay.sherlock.relatedCount(rows.length)}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const weak = (r.evidence_count ?? 1) <= 1;
          return (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-2 rounded-md border p-2 text-[12px]",
                weak ? "border-dashed border-warn/40 bg-warn/5" : "border-border/60 bg-surface-elevated/30",
              )}
            >
              <button
                onClick={() => openEntity(r.other.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-foreground">{r.other.display_name}</p>
                <p className="text-[10.5px] text-muted-foreground capitalize">
                  {r.other.kind} · {r.relation} · ×{r.evidence_count ?? 1}
                </p>
              </button>
              {weak && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Confirm relation"
                    onClick={() => confirm(r.id)}
                  >
                    <Check className="h-3 w-3 text-primary" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Not related — dismiss"
                    onClick={() => dismiss(r.id)}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
