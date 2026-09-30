// AwareAlertsRail — the world's open items, in the room with the map.
//
// Doctrine:
//  - The same queues Today reads (nudges, watches) — never a second system.
//  - Quiet when there's nothing: an empty rail renders nothing at all.
//  - Clearing a nudge here is the same clear as anywhere else; a watch that
//    needs you opens the radar on Today, where its controls live.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { formatDistanceToNow } from "date-fns";
import { Radar, X } from "lucide-react";

/* The nudge kinds that belong to this room: the moving world, not your desk. */
const WORLD_NUDGE_KINDS: Record<string, string> = {
  journey_moved: "Flight",
  flight_evidence_conflict: "Flight disagrees",
  flight_condition_noticed: "Flight",
  flight_before_you_leave: "Before you leave",
  web_page_changed: "Page changed",
  arrival_new_area: "Arrival",
  arrival_known: "Place",
  inbound_needs_you: "Needs you",
};

type NudgeRow = { id: string; kind: string; title: string; created_at: string };
type WatchRow = { id: string; goal: string; updated_at: string };

export function AwareAlertsRail({ onOpenWatches }: { onOpenWatches?: () => void }) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [watches, setWatches] = useState<WatchRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: ns } = await applyScope(
      supabase.from("nudges").select("id, kind, title, created_at"),
    )
      .in("status", ["pending", "seen"])
      .in("kind", Object.keys(WORLD_NUDGE_KINDS))
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);
    setNudges((ns ?? []) as NudgeRow[]);
    const { data: ws } = await supabase
      .from("watches")
      .select("id, goal, updated_at")
      .eq("state", "needs_you")
      .order("updated_at", { ascending: false })
      .limit(3);
    setWatches((ws ?? []) as WatchRow[]);
  }, [user, applyScope]);

  useEffect(() => {
    void load();
  }, [load, scopeKey]);

  const clear = async (id: string) => {
    setNudges((rows) => rows.filter((r) => r.id !== id));
    await supabase.from("nudges").update({ status: "dismissed" }).eq("id", id);
  };

  if (!nudges.length && !watches.length) return null;

  return (
    <section className="vanta-card rounded-xl p-3 space-y-2" aria-label="Open dispatches">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
          Open dispatches
        </span>
        <span className="font-mono text-[9.5px] text-muted-foreground">
          {nudges.length + watches.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {watches.map((w) => (
          <li key={`w-${w.id}`}>
            <button
              type="button"
              onClick={onOpenWatches}
              className="flex w-full items-start gap-2 rounded-lg bg-warn/[0.06] px-2 py-1.5 text-left ring-1 ring-warn/30 hover:bg-warn/[0.1]"
            >
              <Radar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-foreground">{w.goal}</span>
                <span className="block text-[10.5px] text-muted-foreground">
                  Watch needs you · {formatDistanceToNow(new Date(w.updated_at), { addSuffix: true })} · tap for the radar
                </span>
              </span>
            </button>
          </li>
        ))}
        {nudges.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-2 rounded-lg bg-surface-elevated/30 px-2 py-1.5 ring-1 ring-border/50"
          >
            <span className="mt-0.5 shrink-0 rounded-sm px-1 py-px font-mono text-[8.5px] uppercase tracking-wider text-primary ring-1 ring-primary/40">
              {WORLD_NUDGE_KINDS[n.kind] ?? "Note"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-foreground/90">{n.title}</span>
              <span className="block text-[10.5px] text-muted-foreground">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void clear(n.id)}
              aria-label="Clear this dispatch"
              className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-snug text-muted-foreground/80">
        The same queue Today reads — clearing here clears it everywhere.
      </p>
    </section>
  );
}
