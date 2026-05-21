import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEntitySheet } from "./EntityContext";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

type Entity = {
  id: string;
  display_name: string;
  kind: string;
  last_seen_at: string;
};

type Props = {
  seedEntityId: string | null;
  windowDays?: 7 | 30 | 90;
  kinds?: Set<string>;
};

// Phase 6a — Relationship cards. Read-only stacks of entity cards with
// connected-items counts. Tap opens the existing entity sheet. No new writes.
export function CanvasCardsView({ seedEntityId, windowDays = 30, kinds }: Props) {
  const { user } = useAuth();
  const { openEntity } = useEntitySheet();
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [relCounts, setRelCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
      let ids: string[] = [];
      if (seedEntityId) {
        // Pull related entities via entity_relations (both directions)
        const { data: rels } = await supabase
          .from("entity_relations")
          .select("from_entity_id, to_entity_id")
          .eq("user_id", user.id)
          .or(`from_entity_id.eq.${seedEntityId},to_entity_id.eq.${seedEntityId}`);
        const set = new Set<string>([seedEntityId]);
        for (const r of (rels ?? []) as any[]) {
          set.add(r.from_entity_id);
          set.add(r.to_entity_id);
        }
        ids = Array.from(set);
      }

      const q = supabase
        .from("entities")
        .select("id, display_name, kind, last_seen_at")
        .eq("user_id", user.id)
        .order("last_seen_at", { ascending: false })
        .limit(40);
      const { data: ents } = ids.length
        ? await q.in("id", ids)
        : await q.gte("last_seen_at", since);
      let list = (ents ?? []) as Entity[];
      if (kinds && kinds.size > 0) list = list.filter((e) => kinds.has(e.kind));

      const cnt = new Map<string, number>();
      const rc = new Map<string, number>();
      if (list.length > 0) {
        const entIds = list.map((e) => e.id);
        const [{ data: links }, { data: rels2 }] = await Promise.all([
          supabase
            .from("entity_links")
            .select("entity_id, source_kind, source_id")
            .in("entity_id", entIds)
            .limit(2000),
          supabase
            .from("entity_relations")
            .select("from_entity_id, to_entity_id")
            .eq("user_id", user.id)
            .or(`from_entity_id.in.(${entIds.join(",")}),to_entity_id.in.(${entIds.join(",")})`),
        ]);
        const buckets = new Map<string, Set<string>>();
        for (const l of (links ?? []) as any[]) {
          if (!buckets.has(l.entity_id)) buckets.set(l.entity_id, new Set());
          buckets.get(l.entity_id)!.add(`${l.source_kind}:${l.source_id}`);
        }
        for (const [k, v] of buckets) cnt.set(k, v.size);
        for (const r of (rels2 ?? []) as any[]) {
          for (const id of [r.from_entity_id, r.to_entity_id]) {
            rc.set(id, (rc.get(id) ?? 0) + 1);
          }
        }
      }
      if (!alive) return;
      // Rank: relation count desc, then link count, then last_seen
      list.sort((a, b) => {
        const dr = (rc.get(b.id) ?? 0) - (rc.get(a.id) ?? 0);
        if (dr) return dr;
        const dc = (cnt.get(b.id) ?? 0) - (cnt.get(a.id) ?? 0);
        if (dc) return dc;
        return +new Date(b.last_seen_at) - +new Date(a.last_seen_at);
      });
      setEntities(list);
      setCounts(cnt);
      setRelCounts(rc);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId, windowDays, kinds]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (entities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
        Nothing on the canvas yet. Capture a few things and the cards will fill in.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2 space-y-2">
      {entities.map((e) => {
        const refs = counts.get(e.id) ?? 0;
        return (
          <button
            key={e.id}
            onClick={() => openEntity(e.id)}
            className="w-full rounded-xl border border-border bg-surface-elevated/60 p-3 text-left transition active:scale-[0.99] hover:bg-surface-elevated"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{e.display_name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  last seen {formatDistanceToNowStrict(new Date(e.last_seen_at), { addSuffix: true })}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{e.kind}</Badge>
            </div>
            {refs > 0 && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {refs} connected item{refs === 1 ? "" : "s"}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
