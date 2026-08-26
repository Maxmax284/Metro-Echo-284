// Wave 4 — Flow view. Lifecycle pipeline: Capture → Triaged → Drafted →
// Approved → Executed → Audited. Pure read of recent operational objects.
// Doctrine: every item must have an aftermath; the lane it sits in IS that aftermath.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { Loader2, Inbox, Shuffle, FileText, ShieldCheck, Zap, ScrollText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type LaneKey = "captured" | "triaged" | "drafted" | "approved" | "executed" | "audited";

type Item = {
  id: string;
  lane: LaneKey;
  label: string;
  ts: string;
  meta?: string | null;
};

type Props = { seedEntityId: string | null; windowDays?: 7 | 30 | 90 };

const LANES: { key: LaneKey; label: string; Icon: typeof Inbox; tone: string }[] = [
  { key: "captured", label: "Captured",  Icon: Inbox,       tone: "text-muted-foreground" },
  { key: "triaged",  label: "Triaged",   Icon: Shuffle,     tone: "text-foreground/80" },
  { key: "drafted",  label: "Drafted",   Icon: FileText,    tone: "text-primary" },
  { key: "approved", label: "Approved",  Icon: ShieldCheck, tone: "text-signal" },
  { key: "executed", label: "Executed",  Icon: Zap,         tone: "text-signal" },
  { key: "audited",  label: "Audited",   Icon: ScrollText,  tone: "text-muted-foreground" },
];

export function CanvasFlowView({ seedEntityId, windowDays = 30 }: Props) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

      let scopedActionIds: Set<string> | null = null;
      let scopedNoteIds: Set<string> | null = null;
      if (seedEntityId) {
        const { data: links } = await supabase
          .from("entity_links")
          .select("source_kind, source_id")
          .eq("user_id", user.id)
          .eq("entity_id", seedEntityId)
          .limit(500);
        scopedActionIds = new Set();
        scopedNoteIds = new Set();
        for (const l of (links ?? []) as any[]) {
          if (l.source_kind === "action") scopedActionIds.add(l.source_id);
          if (l.source_kind === "note") scopedNoteIds.add(l.source_id);
        }
      }

      const [routes, actions, audit] = await Promise.all([
        applyScope(supabase.from("capture_routes")
          .select("id, capture_kind, user_action, suggested_route, source, created_at, payload")
          .eq("user_id", user.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(60)),
        applyScope(supabase.from("actions")
          .select("id, title, status, risk, risk_acknowledged_at, executed_at, created_at, updated_at")
          .eq("user_id", user.id)
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(80)),
        applyScope(supabase.from("audit_log")
          .select("id, event, entity_type, entity_id, created_at, payload")
          .eq("user_id", user.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(80)),
      ]);

      const merged: Item[] = [];

      for (const r of (routes.data ?? []) as any[]) {
        const lane: LaneKey = r.user_action === "needs_review" || r.user_action === "captured" ? "captured" : "triaged";
        const label = (r.payload?.title || r.payload?.summary || r.capture_kind || "Capture").toString().slice(0, 80);
        merged.push({
          id: `r-${r.id}`,
          lane,
          label,
          ts: r.created_at,
          meta: `${r.source ?? "capture"} · ${r.user_action ?? "routed"}`,
        });
      }

      for (const a of (actions.data ?? []) as any[]) {
        if (scopedActionIds && !scopedActionIds.has(a.id)) continue;
        let lane: LaneKey;
        if (a.executed_at) lane = "executed";
        else if (a.status === "approved" || a.risk_acknowledged_at) lane = "approved";
        else if (a.status === "staged" || a.status === "proposed") lane = "drafted";
        else continue;
        merged.push({
          id: `a-${a.id}`,
          lane,
          label: a.title || "Untitled action",
          ts: a.executed_at || a.updated_at || a.created_at,
          meta: `${a.risk?.replace?.("_", " ") ?? "standard"} · ${a.status}`,
        });
      }

      for (const e of (audit.data ?? []) as any[]) {
        if (!e.event?.includes("executed") && !e.event?.includes("rolled_back")) continue;
        merged.push({
          id: `e-${e.id}`,
          lane: "audited",
          label: e.event,
          ts: e.created_at,
          meta: e.entity_type,
        });
      }

      if (!alive) return;
      setItems(merged.sort((x, y) => +new Date(y.ts) - +new Date(x.ts)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId, windowDays, scopeKey]);

  const grouped = useMemo(() => {
    const map = new Map<LaneKey, Item[]>();
    for (const lane of LANES) map.set(lane.key, []);
    for (const it of items) {
      const arr = map.get(it.lane);
      if (arr && arr.length < 6) arr.push(it);
    }
    return map;
  }, [items]);

  const counts = useMemo(() => {
    const map = new Map<LaneKey, number>();
    for (const lane of LANES) map.set(lane.key, 0);
    for (const it of items) map.set(it.lane, (map.get(it.lane) ?? 0) + 1);
    return map;
  }, [items]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
        Nothing in the pipeline yet. Capture, triage, or draft something and lanes will fill in.
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full min-w-max gap-2 px-3 pb-3">
        {LANES.map((lane) => {
          const list = grouped.get(lane.key) ?? [];
          const total = counts.get(lane.key) ?? 0;
          return (
            <div
              key={lane.key}
              className="flex h-full w-[170px] shrink-0 flex-col rounded-lg border border-border/60 bg-surface-elevated/40"
            >
              <div className="flex items-center justify-between border-b border-border/40 px-2 py-1.5">
                <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", lane.tone)}>
                  <lane.Icon className="h-3 w-3" />
                  {lane.label}
                </div>
                <span className="text-[10px] text-muted-foreground">{total}</span>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
                {list.length === 0 ? (
                  <div className="pt-2 text-center text-[10.5px] text-muted-foreground/70">—</div>
                ) : (
                  list.map((it) => (
                    <div
                      key={it.id}
                      className="rounded border border-border/40 bg-background/60 p-1.5"
                    >
                      <div className="line-clamp-2 text-[11.5px] text-foreground">{it.label}</div>
                      <div className="mt-0.5 truncate text-[9.5px] text-muted-foreground">
                        {it.meta ? `${it.meta} · ` : ""}
                        {formatDistanceToNow(new Date(it.ts), { addSuffix: true })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
