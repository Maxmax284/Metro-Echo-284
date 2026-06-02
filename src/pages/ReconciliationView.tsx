// Reconciliation view — compares raw external-platform signals (messages +
// capture_routes) against what briefing-compose surfaces. Flags any mismatch
// so we can catch the briefing missing a platform, miscounting, or going stale.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatDistanceToNow } from "date-fns";

const PLATFORM_DISPLAY: Record<string, string> = {
  ground_truth_hub: "Ground Truth Hub",
  campcore: "CampCore",
  fenrir_lock: "Fenrir Lock",
  website_forms: "Website Forms",
  telegram: "Telegram",
  email: "Email",
};
const displayPlatform = (k: string) => PLATFORM_DISPLAY[k] ?? k;

type SignalRow = {
  id: string;
  source_platform: string;
  needs_review: boolean;
  signal_only: boolean;
  created_at: string;
  in_briefing_window: boolean;
};

type RouteRow = {
  id: string;
  source: string;
  user_action: string;
  created_at: string;
};

type Briefing = {
  headline: string;
  counts: {
    external_signals: number;
    external_by_source: Record<string, number>;
  };
  items: Array<{ kind: string; source?: string; label: string; id: string }>;
  generated_at: string;
  signals_hash: string;
  ai_skipped: boolean;
};

type PlatformRow = {
  platform: string;
  rawMessages: number;
  rawRoutes: number;
  briefingCount: number;
  briefingItems: number;
  status: "ok" | "mismatch" | "missing" | "extra";
  detail: string;
};

const BRIEFING_WINDOW_HOURS = 48; // briefing-compose uses ~48h fresh window for external signals

export default function ReconciliationView() {
  const { session } = useAuth();
  const { timezone } = useUserTimezone();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const run = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const sinceIso = new Date(Date.now() - BRIEFING_WINDOW_HOURS * 3600 * 1000).toISOString();

      const [msgRes, routeRes, briefRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id, created_at, metadata")
          .eq("user_id", session.user.id)
          .filter("metadata->>signal_only", "eq", "true")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("capture_routes")
          .select("id, source, user_action, created_at")
          .eq("user_id", session.user.id)
          .not("source", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.functions.invoke("briefing-compose", {
          body: { timezone, part_of_day: "midday", if_match: null },
        }),
      ]);

      if (msgRes.error) throw msgRes.error;
      if (routeRes.error) throw routeRes.error;
      if (briefRes.error) throw briefRes.error;

      const sigRows: SignalRow[] = (msgRes.data ?? [])
        .map((m: any) => {
          const meta = m.metadata ?? {};
          const sp = meta.source_platform ?? meta.source ?? "unknown";
          return {
            id: m.id,
            source_platform: String(sp),
            needs_review: meta.needs_review === true || meta.needs_review === "true",
            signal_only: true,
            created_at: m.created_at,
            in_briefing_window: m.created_at >= sinceIso,
          };
        });

      const knownPlatforms = new Set(Object.keys(PLATFORM_DISPLAY));
      const routeRows: RouteRow[] = (routeRes.data ?? []).filter((r: any) =>
        knownPlatforms.has(r.source) || ["ground_truth_hub", "campcore", "fenrir_lock", "website_forms"].includes(r.source),
      );

      setSignals(sigRows);
      setRoutes(routeRows);
      setBriefing(briefRes.data as Briefing);
      setLastRun(new Date());
    } catch (e: any) {
      console.warn("reconciliation failed", e);
      setError(e?.message ?? "Reconciliation failed");
    } finally {
      setLoading(false);
    }
  }, [session, timezone]);

  useEffect(() => {
    if (session) run();
  }, [session, run]);

  const rows: PlatformRow[] = useMemo(() => {
    if (!briefing) return [];
    const byBriefing = briefing.counts?.external_by_source ?? {};
    const briefingItemsByPlatform = new Map<string, number>();
    for (const it of briefing.items ?? []) {
      if (it.kind !== "external_signal") continue;
      const s = it.source ?? "unknown";
      briefingItemsByPlatform.set(s, (briefingItemsByPlatform.get(s) ?? 0) + 1);
    }

    const rawByPlatform = new Map<string, number>();
    for (const s of signals) {
      if (!s.in_briefing_window || !s.needs_review) continue;
      rawByPlatform.set(s.source_platform, (rawByPlatform.get(s.source_platform) ?? 0) + 1);
    }
    const routesByPlatform = new Map<string, number>();
    for (const r of routes) {
      routesByPlatform.set(r.source, (routesByPlatform.get(r.source) ?? 0) + 1);
    }

    const platforms = new Set<string>([
      ...rawByPlatform.keys(),
      ...routesByPlatform.keys(),
      ...Object.keys(byBriefing),
    ]);

    const out: PlatformRow[] = [];
    for (const p of platforms) {
      const raw = rawByPlatform.get(p) ?? 0;
      const route = routesByPlatform.get(p) ?? 0;
      const brief = byBriefing[p] ?? 0;
      const briefItems = briefingItemsByPlatform.get(p) ?? 0;

      let status: PlatformRow["status"] = "ok";
      let detail = "Counts match.";
      if (raw > 0 && brief === 0) {
        status = "missing";
        detail = `${raw} raw signal(s) in last ${BRIEFING_WINDOW_HOURS}h, but briefing shows none.`;
      } else if (raw === 0 && brief > 0) {
        status = "extra";
        detail = `Briefing claims ${brief} but no raw signal rows match.`;
      } else if (raw !== brief) {
        status = "mismatch";
        detail = `Raw=${raw}, briefing=${brief}.`;
      } else if (brief > 0 && briefItems === 0) {
        status = "mismatch";
        detail = `Count present (${brief}) but no items surfaced in "Why this matters".`;
      }
      out.push({
        platform: p,
        rawMessages: raw,
        rawRoutes: route,
        briefingCount: brief,
        briefingItems: briefItems,
        status,
        detail,
      });
    }
    out.sort((a, b) => a.platform.localeCompare(b.platform));
    return out;
  }, [briefing, signals, routes]);

  const mismatches = rows.filter(r => r.status !== "ok");
  const totalRaw = rows.reduce((s, r) => s + r.rawMessages, 0);
  const totalBrief = briefing?.counts?.external_signals ?? 0;
  const totalMismatch = totalRaw !== totalBrief;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/settings/integrations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Integrations
          </Link>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Re-run</span>
          </Button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Briefing reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Compares raw external-platform signals (messages + capture_routes) against what
            briefing-compose surfaced. Flags anything the briefing missed, mis-counted, or went stale on.
            Window: last {BRIEFING_WINDOW_HOURS}h.
          </p>
        </div>

        {error && (
          <Card className="p-4 border-destructive/50 bg-destructive/5 text-sm text-destructive">
            {error}
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={totalMismatch ? "destructive" : "secondary"} className="gap-1">
              {totalMismatch ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              Total raw {totalRaw} · briefing {totalBrief}
            </Badge>
            {briefing && (
              <>
                <span className="text-xs text-muted-foreground">
                  Briefing generated {formatDistanceToNow(new Date(briefing.generated_at), { addSuffix: true })}
                </span>
                <span className="text-xs text-muted-foreground">
                  hash: <code className="font-mono">{briefing.signals_hash?.slice(0, 8)}</code>
                  {briefing.ai_skipped ? " · cached" : " · fresh"}
                </span>
              </>
            )}
            {lastRun && (
              <span className="text-xs text-muted-foreground ml-auto">
                Checked {formatDistanceToNow(lastRun, { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Headline: <span className="text-foreground">{briefing?.headline ?? "—"}</span>
          </p>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Platform</th>
                <th className="text-right p-3">Raw msgs</th>
                <th className="text-right p-3">Routes</th>
                <th className="text-right p-3">Briefing #</th>
                <th className="text-right p-3">Items</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                  {loading ? "Loading…" : "No external signals or briefing data in window."}
                </td></tr>
              )}
              {rows.map(r => (
                <tr key={r.platform} className="border-t border-border/60">
                  <td className="p-3 font-medium">{displayPlatform(r.platform)}</td>
                  <td className="p-3 text-right tabular-nums">{r.rawMessages}</td>
                  <td className="p-3 text-right tabular-nums">{r.rawRoutes}</td>
                  <td className="p-3 text-right tabular-nums">{r.briefingCount}</td>
                  <td className="p-3 text-right tabular-nums">{r.briefingItems}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {r.status === "ok" ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> ok
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {r.status}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{r.detail}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {mismatches.length > 0 && (
          <Card className="p-4 space-y-2 border-amber-500/40 bg-amber-500/5">
            <div className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {mismatches.length} mismatch(es) detected
            </div>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              {mismatches.map(m => (
                <li key={m.platform}>
                  <span className="text-foreground">{displayPlatform(m.platform)}</span> — {m.detail}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Common causes: briefing cache hash collision, role-gating hides the source, or
              metadata.source_platform missing on inbound signal-only messages.
            </p>
          </Card>
        )}

        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Recent raw signals (last 20)</div>
          <ul className="text-xs space-y-1 font-mono">
            {signals.slice(0, 20).map(s => (
              <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="text-foreground">{displayPlatform(s.source_platform)}</span>
                <span>{s.needs_review ? "needs_review" : "—"}</span>
                <span>{s.in_briefing_window ? "in-window" : "stale"}</span>
                <span>{new Date(s.created_at).toLocaleString()}</span>
              </li>
            ))}
            {signals.length === 0 && <li className="text-muted-foreground">No signal-only messages found.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
