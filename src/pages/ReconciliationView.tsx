// Reconciliation view — compares raw external-platform signals (messages +
// capture_routes) against what briefing-compose surfaced. Flags any mismatch
// so we can catch the briefing missing a platform, miscounting, or going stale.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CalendarDays,
  Filter,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, scopeLabel } from "@/providers/WorkspaceProvider";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { format, startOfDay, endOfDay, subDays, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const PLATFORM_DISPLAY: Record<string, string> = {
  ground_truth_hub: "Ground Truth Hub",
  campcore: "CampCore",
  fenrir_lock: "Fenrir Lock",
  website_forms: "Website Forms",
  telegram: "Telegram",
  email: "Email",
};
const ALL_PLATFORMS = Object.keys(PLATFORM_DISPLAY);
const displayPlatform = (k: string) => PLATFORM_DISPLAY[k] ?? k;

function DatePickerButton({
  date,
  onSelect,
  placeholder,
}: {
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  placeholder: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-[150px] justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {date ? format(date, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

type SignalRow = {
  id: string;
  source_platform: string;
  needs_review: boolean;
  signal_only: boolean;
  created_at: string;
  in_window: boolean;
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

const DEFAULT_WINDOW_DAYS = 2;

export default function ReconciliationView() {
  const { session } = useAuth();
  const { timezone } = useUserTimezone();
  const { scope, activeMembership } = useWorkspace();
  const scopeOrgId = scope.kind === "workspace" ? scope.organization_id : null;
  const scopeChip = scopeLabel(scope, activeMembership);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const [startDate, setStartDate] = useState<Date | undefined>(
    startOfDay(subDays(new Date(), DEFAULT_WINDOW_DAYS - 1))
  );
  const [endDate, setEndDate] = useState<Date | undefined>(endOfDay(new Date()));
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(ALL_PLATFORMS)
  );

  const togglePlatform = (key: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetFilters = useCallback(() => {
    setStartDate(startOfDay(subDays(new Date(), DEFAULT_WINDOW_DAYS - 1)));
    setEndDate(endOfDay(new Date()));
    setSelectedPlatforms(new Set(ALL_PLATFORMS));
  }, []);

  const sinceIso = useMemo(
    () => (startDate ? startOfDay(startDate).toISOString() : undefined),
    [startDate]
  );
  const untilIso = useMemo(
    () => (endDate ? endOfDay(endDate).toISOString() : undefined),
    [endDate]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedPlatforms.size !== ALL_PLATFORMS.length) count++;
    const defaultStart = startOfDay(subDays(new Date(), DEFAULT_WINDOW_DAYS - 1));
    if (startDate && startDate.getTime() !== defaultStart.getTime()) count++;
    const defaultEnd = endOfDay(new Date());
    if (endDate && endDate.getTime() !== defaultEnd.getTime()) count++;
    return count;
  }, [selectedPlatforms, startDate, endDate]);

  const run = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const sourcesArr = selectedPlatforms.size === ALL_PLATFORMS.length ? undefined : Array.from(selectedPlatforms);

      // Mirror briefing-compose's lane rule: personal/admin = org_id IS NULL,
      // workspace = matching org_id. Without this the raw counts mix lanes
      // while the briefing only sees its own, producing false mismatches.
      const applyLane = <T,>(q: T): T => {
        const anyQ = q as any;
        if (scopeOrgId) anyQ.eq("organization_id", scopeOrgId);
        else anyQ.is("organization_id", null);
        return q;
      };

      const msgQ = applyLane(
        supabase
          .from("messages")
          .select("id, created_at, metadata, organization_id")
          .eq("user_id", session.user.id)
          .filter("metadata->>signal_only", "eq", "true")
          .order("created_at", { ascending: false })
          .limit(1000)
      );
      const routeQ = applyLane(
        supabase
          .from("capture_routes")
          .select("id, source, user_action, created_at, organization_id")
          .eq("user_id", session.user.id)
          .not("source", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000)
      );

      const [msgRes, routeRes, briefRes] = await Promise.all([
        msgQ,
        routeQ,
        supabase.functions.invoke("briefing-compose", {
          body: {
            timezone,
            part_of_day: "midday",
            if_match: null,
            since: sinceIso,
            until: untilIso,
            sources: sourcesArr,
            scope: scopeOrgId
              ? { kind: "workspace", organization_id: scopeOrgId }
              : { kind: scope.kind === "admin" ? "admin" : "personal" },
          },
        }),
      ]);

      if (msgRes.error) throw msgRes.error;
      if (routeRes.error) throw routeRes.error;
      if (briefRes.error) throw briefRes.error;

      const sigRows: SignalRow[] = (msgRes.data ?? [])
        .map((m: any) => {
          const meta = m.metadata ?? {};
          const sp = meta.source_platform ?? meta.source ?? "unknown";
          const created = m.created_at;
          const inWindow =
            (!sinceIso || created >= sinceIso) && (!untilIso || created <= untilIso);
          return {
            id: m.id,
            source_platform: String(sp),
            needs_review: meta.needs_review === true || meta.needs_review === "true",
            signal_only: true,
            created_at: created,
            in_window: inWindow,
          };
        })
        .filter((s: SignalRow) => selectedPlatforms.has(s.source_platform));

      const knownPlatforms = new Set(ALL_PLATFORMS);
      const routeRows: RouteRow[] = (routeRes.data ?? [])
        .filter((r: any) => knownPlatforms.has(r.source) && selectedPlatforms.has(r.source))
        .filter((r: any) => {
          const created = r.created_at;
          return (!sinceIso || created >= sinceIso) && (!untilIso || created <= untilIso);
        });

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
  }, [session, timezone, sinceIso, untilIso, selectedPlatforms, scopeOrgId, scope.kind]);

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
      if (!s.in_window || !s.needs_review) continue;
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
        detail = `${raw} raw signal(s) in window, but briefing shows none.`;
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

  const mismatches = rows.filter((r) => r.status !== "ok");
  const totalRaw = rows.reduce((s, r) => s + r.rawMessages, 0);
  const totalBrief = briefing?.counts?.external_signals ?? 0;
  const totalMismatch = totalRaw !== totalBrief;

  const rawTotalAll = signals.filter((s) => s.in_window && s.needs_review).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/settings/integrations"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Integrations
          </Link>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Re-run</span>
          </Button>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Briefing reconciliation</h1>
            <Badge variant="outline" className="text-[11px]">
              Scope: {scopeChip}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Compares raw external-platform signals against what briefing-compose surfaced,
            inside the active lane. Switch scope in the cockpit header to reconcile a different workspace.
          </p>
        </div>

        {/* Filters */}
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">From</span>
              <DatePickerButton
                date={startDate}
                onSelect={setStartDate}
                placeholder="Start date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <DatePickerButton
                date={endDate}
                onSelect={setEndDate}
                placeholder="End date"
              />
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1 text-muted-foreground">
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Platforms</span>
            {ALL_PLATFORMS.map((key) => (
              <label
                key={key}
                className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none"
              >
                <Checkbox
                  checked={selectedPlatforms.has(key)}
                  onCheckedChange={() => togglePlatform(key)}
                />
                <span className={cn(!selectedPlatforms.has(key) && "text-muted-foreground")}>
                  {displayPlatform(key)}
                </span>
              </label>
            ))}
          </div>
        </Card>

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
          <p className="text-xs text-muted-foreground">
            Window: {startDate ? format(startDate, "MMM d") : "—"} →{" "}
            {endDate ? format(endDate, "MMM d, yyyy") : "—"} ·{" "}
            {selectedPlatforms.size} of {ALL_PLATFORMS.length} platforms ·{" "}
            {rawTotalAll} raw signal-only messages in window
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
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                    {loading ? "Loading…" : "No external signals or briefing data in window."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
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
              {mismatches.map((m) => (
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
            {signals.slice(0, 20).map((s) => (
              <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="text-foreground">{displayPlatform(s.source_platform)}</span>
                <span>{s.needs_review ? "needs_review" : "—"}</span>
                <span>{s.in_window ? "in-window" : "stale"}</span>
                <span>{new Date(s.created_at).toLocaleString()}</span>
              </li>
            ))}
            {signals.length === 0 && (
              <li className="text-muted-foreground">No signal-only messages found.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

