import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type UsageLog = {
  id: string; provider: string; feature: string; status: string;
  cache_hit: boolean; created_at: string; error_message: string | null;
};

type UsageLimit = {
  id: string; provider: string; feature: string;
  limit_per_minute: number | null; limit_per_hour: number | null;
  limit_per_day: number | null; limit_per_month: number | null;
  max_calls_per_task: number | null; enabled: boolean;
};

/** Per-feature ceilings and the raw call record — receipts, not controls. */
export function ApiRecordsSection() {
  const { session } = useAuth();
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [limits, setLimits] = useState<UsageLimit[]>([]);

  useEffect(() => {
    if (!session) return;
    supabase.from("api_usage_logs")
      .select("id,provider,feature,status,cache_hit,created_at,error_message")
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setLogs((data ?? []) as UsageLog[]));
    supabase.from("usage_limits")
      .select("id,provider,feature,limit_per_minute,limit_per_hour,limit_per_day,limit_per_month,max_calls_per_task,enabled")
      .order("provider", { ascending: true })
      .then(({ data }) => setLimits((data ?? []) as UsageLimit[]));
  }, [session]);

  return (
    <>
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Per-feature limits</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Defaults are conservative. Limits are seeded as features come online.
        </p>
        {limits.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">No custom limits yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-1">Provider</th><th>Feature</th><th>Day</th><th>Month</th><th>Per task</th><th>Enabled</th></tr>
              </thead>
              <tbody>
                {limits.map((l) => (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="py-1.5">{l.provider}</td>
                    <td>{l.feature}</td>
                    <td className="font-mono">{l.limit_per_day ?? "—"}</td>
                    <td className="font-mono">{l.limit_per_month ?? "—"}</td>
                    <td className="font-mono">{l.max_calls_per_task ?? "—"}</td>
                    <td>{l.enabled ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Recent API calls</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Last 50 attempts across all providers.</p>
        {logs.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">No calls recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2 py-1.5 text-[11.5px] ring-1 ring-border/40">
                <span className="font-mono text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>
                <span className="truncate">{l.provider} · {l.feature}</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                  l.status === "success" && "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
                  l.status === "cached" && "bg-primary/15 text-primary ring-primary/30",
                  (l.status === "blocked" || l.status === "rate_limited" || l.status === "disabled" || l.status === "over_budget") && "bg-amber-500/15 text-amber-300 ring-amber-500/30",
                  l.status === "failed" && "bg-destructive/15 text-destructive ring-destructive/30",
                )}>
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
