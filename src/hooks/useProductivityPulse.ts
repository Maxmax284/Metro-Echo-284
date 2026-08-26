// Wave 4 — Productivity pulse. Calm metrics derived from existing tables.
// No new schema. No AI calls. Reads what's already there.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ProductivityPulse = {
  loading: boolean;
  today: {
    captures: number;
    triaged: number;
    approvalsCleared: number;
    executed: number;
    commitmentsClosed: number;
  };
  week: {
    executed: number;
    proposed: number;
    commitmentsClosed: number;
    medianMinutesToExecute: number | null;
    sparkline: number[]; // executed per day, oldest → newest, length 7
  };
};

const EMPTY: ProductivityPulse = {
  loading: true,
  today: { captures: 0, triaged: 0, approvalsCleared: 0, executed: 0, commitmentsClosed: 0 },
  week: { executed: 0, proposed: 0, commitmentsClosed: 0, medianMinutesToExecute: null, sparkline: [0,0,0,0,0,0,0] },
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a,b) => a-b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

export function useProductivityPulse(): ProductivityPulse {
  const { user } = useAuth();
  const [state, setState] = useState<ProductivityPulse>(EMPTY);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const now = new Date();
      const today = startOfDay(now);
      const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 6);

      const [routes, actions, commits] = await Promise.all([
        applyScope(supabase.from("capture_routes")
          .select("user_action, created_at")
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString())
          .limit(1000)),
        applyScope(supabase.from("actions")
          .select("id, status, created_at, executed_at, risk_acknowledged_at, updated_at")
          .eq("user_id", user.id)
          .gte("updated_at", weekStart.toISOString())
          .limit(1000)),
        applyScope(supabase.from("commitments")
          .select("status, updated_at")
          .eq("user_id", user.id)
          .eq("status", "done")
          .gte("updated_at", weekStart.toISOString())
          .limit(1000)),
      ]);

      if (!alive) return;

      const routeRows = (routes.data ?? []) as any[];
      const actionRows = (actions.data ?? []) as any[];
      const commitRows = (commits.data ?? []) as any[];

      const isToday = (iso?: string | null) => !!iso && new Date(iso) >= today;

      const tCaptures = routeRows.filter(r => isToday(r.created_at)).length;
      const tTriaged = routeRows.filter(r => isToday(r.created_at) && r.user_action && r.user_action !== "needs_review" && r.user_action !== "captured").length;
      const tApprovalsCleared = actionRows.filter(a => isToday(a.risk_acknowledged_at)).length;
      const tExecuted = actionRows.filter(a => isToday(a.executed_at)).length;
      const tCommitsClosed = commitRows.filter(c => isToday(c.updated_at)).length;

      const wExecuted = actionRows.filter(a => !!a.executed_at).length;
      const wProposed = actionRows.length;
      const wCommitsClosed = commitRows.length;

      const durations: number[] = [];
      for (const a of actionRows) {
        if (a.executed_at && a.created_at) {
          const diffMs = +new Date(a.executed_at) - +new Date(a.created_at);
          if (diffMs > 0) durations.push(diffMs / 60000);
        }
      }
      const med = median(durations);

      const buckets = new Array(7).fill(0);
      for (const a of actionRows) {
        if (!a.executed_at) continue;
        const day = startOfDay(new Date(a.executed_at));
        const idx = Math.floor((+day - +weekStart) / 86400000);
        if (idx >= 0 && idx < 7) buckets[idx]++;
      }

      setState({
        loading: false,
        today: {
          captures: tCaptures,
          triaged: tTriaged,
          approvalsCleared: tApprovalsCleared,
          executed: tExecuted,
          commitmentsClosed: tCommitsClosed,
        },
        week: {
          executed: wExecuted,
          proposed: wProposed,
          commitmentsClosed: wCommitsClosed,
          medianMinutesToExecute: med,
          sparkline: buckets,
        },
      });
    })();
    return () => { alive = false; };
  }, [user]);

  return state;
}
