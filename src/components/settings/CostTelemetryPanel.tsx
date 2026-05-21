// Wave 6 — Cost telemetry panel. Read-only aggregation of api_usage_logs.
// Owner-scoped (RLS already gates this). No writes, no AI calls — just
// surfaces what's already being recorded so cost stays visible.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Activity, RefreshCw } from "lucide-react";

type Row = {
  provider: string;
  feature: string;
  status: string;
  cache_hit: boolean;
  tokens_used: number | null;
  credits_used: number | null;
  estimated_cost: number | null;
  created_at: string;
};

type Agg = {
  key: string;
  provider: string;
  feature: string;
  calls: number;
  errors: number;
  cacheHits: number;
  tokens: number;
  credits: number;
  cost: number;
};

const WINDOW_DAYS = 7;

export function CostTelemetryPanel() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const { data } = await supabase
      .from("api_usage_logs")
      .select("provider, feature, status, cache_hit, tokens_used, credits_used, estimated_cost, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = {
    calls: rows.length,
    errors: rows.filter((r) => r.status && r.status !== "ok" && r.status !== "success").length,
    cacheHits: rows.filter((r) => r.cache_hit).length,
    tokens: rows.reduce((s, r) => s + (r.tokens_used ?? 0), 0),
    credits: rows.reduce((s, r) => s + (r.credits_used ?? 0), 0),
    cost: rows.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0),
  };
  const cacheRate = totals.calls > 0 ? Math.round((totals.cacheHits / totals.calls) * 100) : 0;
  const errorRate = totals.calls > 0 ? Math.round((totals.errors / totals.calls) * 100) : 0;

  const byKey = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.provider}|${r.feature}`;
    const a = byKey.get(key) ?? {
      key, provider: r.provider, feature: r.feature,
      calls: 0, errors: 0, cacheHits: 0, tokens: 0, credits: 0, cost: 0,
    };
    a.calls++;
    if (r.status && r.status !== "ok" && r.status !== "success") a.errors++;
    if (r.cache_hit) a.cacheHits++;
    a.tokens += r.tokens_used ?? 0;
    a.credits += r.credits_used ?? 0;
    a.cost += Number(r.estimated_cost ?? 0);
    byKey.set(key, a);
  }
  const aggs = Array.from(byKey.values()).sort((x, y) => y.cost - x.cost || y.calls - x.calls);

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Cost telemetry</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">last {WINDOW_DAYS} days</span>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Aggregated from api_usage_logs. Nothing is auto-throttled here — adjust caps in Per-feature limits.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Calls" value={totals.calls.toLocaleString()} />
            <Stat label="Cache hit" value={`${cacheRate}%`} />
            <Stat label="Errors" value={`${errorRate}%`} tone={errorRate > 10 ? "warn" : undefined} />
            <Stat label="Est. cost" value={`$${totals.cost.toFixed(4)}`} />
          </div>

          {aggs.length === 0 ? (
            <p className="mt-4 text-[12px] text-muted-foreground">No API calls recorded in this window.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-[12px]">
                <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Provider</th>
                    <th className="pr-2">Feature</th>
                    <th className="pr-2 text-right">Calls</th>
                    <th className="pr-2 text-right">Cache</th>
                    <th className="pr-2 text-right">Errors</th>
                    <th className="pr-2 text-right">Tokens</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {aggs.map((a) => {
                    const cachePct = a.calls > 0 ? Math.round((a.cacheHits / a.calls) * 100) : 0;
                    const errPct = a.calls > 0 ? Math.round((a.errors / a.calls) * 100) : 0;
                    return (
                      <tr key={a.key} className="border-t border-border/40">
                        <td className="py-1.5 pr-2 text-foreground">{a.provider}</td>
                        <td className="pr-2 text-muted-foreground">{a.feature}</td>
                        <td className="pr-2 text-right tabular-nums">{a.calls}</td>
                        <td className="pr-2 text-right tabular-nums text-muted-foreground">{cachePct}%</td>
                        <td className={`pr-2 text-right tabular-nums ${errPct > 10 ? "text-warn" : "text-muted-foreground"}`}>{errPct}%</td>
                        <td className="pr-2 text-right tabular-nums text-muted-foreground">{a.tokens.toLocaleString()}</td>
                        <td className="text-right tabular-nums">${a.cost.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
