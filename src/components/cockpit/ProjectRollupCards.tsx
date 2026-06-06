// ProjectRollupCards — per-project / per-pinned-entity rollup.
// Plain-English summary on top, structured counts underneath.
// Mobile-first single column at 384px.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Folder, Loader2, Pin } from "lucide-react";
import { fetchEntityRollup, type EntityRollup } from "@/lib/briefs";
import { BriefComposerSheet } from "@/components/briefs/BriefComposerSheet";
import { useCanvas } from "@/components/entities/CanvasContext";

type EntityHeader = {
  id: string;
  display_name: string;
  kind: string;
  pinned: boolean;
  slug: string | null;
  summary: string | null;
};

export function ProjectRollupCards() {
  const { session } = useAuth();
  const { openCanvas } = useCanvas();
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<EntityHeader[]>([]);
  const [rollups, setRollups] = useState<Record<string, EntityRollup | null>>({});
  const [composeFor, setComposeFor] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("entities")
        .select("id, display_name, kind, pinned, slug, summary")
        .eq("user_id", session.user.id)
        .or("kind.eq.project,pinned.eq.true")
        .order("pinned", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(12);
      if (cancelled) return;
      const list = (data ?? []) as EntityHeader[];
      setEntities(list);

      // Fetch rollups in parallel
      const entries = await Promise.all(
        list.map(async (e) => {
          try {
            const r = await fetchEntityRollup(e.id);
            return [e.id, r] as const;
          } catch {
            return [e.id, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setRollups(Object.fromEntries(entries));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-2 border-border/60 bg-surface-elevated/40 p-6 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Rolling up projects…
      </Card>
    );
  }

  if (entities.length === 0) {
    return (
      <Card className="border-border/60 bg-surface-elevated/40 p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Folder className="h-3 w-3" /> Project rollup
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          No projects or pinned entities yet. Pin an entity from the canvas to see it summarized here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Folder className="h-3 w-3" /> Project rollup
        </div>
        <span className="text-[10.5px] text-muted-foreground">{entities.length} surfaced</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {entities.map((e) => {
          const r = rollups[e.id];
          return (
            <RollupCard
              key={e.id}
              entity={e}
              rollup={r}
              onOpen={() => openCanvas(e.id)}
              onCreateBrief={() => setComposeFor({ id: e.id, label: e.display_name })}
            />
          );
        })}
      </div>

      <BriefComposerSheet
        open={!!composeFor}
        onOpenChange={(o) => !o && setComposeFor(null)}
        defaultScope="entity"
        entityId={composeFor?.id}
        entityLabel={composeFor?.label}
      />
    </div>
  );
}

function RollupCard({
  entity, rollup, onOpen, onCreateBrief,
}: {
  entity: EntityHeader;
  rollup: EntityRollup | null;
  onOpen: () => void;
  onCreateBrief: () => void;
}) {
  const c = rollup?.counts;
  const recentChange = rollup?.recent_changes?.[0];
  const needs =
    (c?.commitments_overdue ?? 0) > 0
      ? `${c?.commitments_overdue} overdue commitment${(c?.commitments_overdue ?? 0) === 1 ? "" : "s"}`
      : (c?.actions_high_risk ?? 0) > 0
      ? `${c?.actions_high_risk} high-risk action${(c?.actions_high_risk ?? 0) === 1 ? "" : "s"}`
      : (c?.sherlock_pending ?? 0) > 0
      ? `${c?.sherlock_pending} Sherlock finding${(c?.sherlock_pending ?? 0) === 1 ? "" : "s"} pending`
      : null;

  const linkedSummary = c
    ? [
        c.notes && `${c.notes} note${c.notes === 1 ? "" : "s"}`,
        c.commitments_open && `${c.commitments_open} commitment${c.commitments_open === 1 ? "" : "s"}`,
        c.actions_pending && `${c.actions_pending} action${c.actions_pending === 1 ? "" : "s"}`,
        c.files && `${c.files} file${c.files === 1 ? "" : "s"}`,
      ].filter(Boolean).join(", ")
    : null;

  return (
    <Card className="flex flex-col gap-2.5 border-border/60 bg-surface-elevated/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {entity.pinned && <Pin className="h-3 w-3 text-primary" />}
            <span className="truncate text-[14px] font-medium text-foreground">{entity.display_name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <span>{entity.kind}</span>
            {entity.slug && <span className="font-mono normal-case tracking-normal text-[10px]">· {entity.slug}</span>}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {c?.audit_7d ?? 0} receipts · 7d
        </Badge>
      </div>

      {entity.summary && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{entity.summary}</p>
      )}

      <div className="space-y-1 text-[12.5px]">
        {recentChange ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Recent</span>
            <span className="truncate text-foreground/90">{recentChange.label}</span>
          </div>
        ) : (
          <div className="text-[11.5px] text-muted-foreground">No recent linked changes.</div>
        )}
        {needs && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-warn shrink-0">Needs</span>
            <span className="text-warn/90">{needs}</span>
          </div>
        )}
        {linkedSummary && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Linked</span>
            <span className="truncate text-foreground/80">{linkedSummary}</span>
          </div>
        )}
      </div>

      {rollup?.suggested_next && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11.5px] text-foreground/90">
          Suggested next: {rollup.suggested_next.label}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11.5px]" onClick={onOpen}>
          Open <ArrowRight className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11.5px]" onClick={onCreateBrief}>
          <FileText className="h-3 w-3" /> Create brief
        </Button>
      </div>
    </Card>
  );
}
