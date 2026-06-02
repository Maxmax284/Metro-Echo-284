// OperationsBriefingPanel — the dashboard's plain-English shift report.
//
// Reads from briefing-compose (which gates sources by role *before* querying,
// so the AI never sees data the user isn't allowed to see). Caches the last
// response and re-uses it when `signals_hash` matches — no paid AI calls on
// render, focus, or refresh-without-change.
//
// Live Capture stays the receipt roll; this card answers "what does it mean".
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useRole, type Role } from "@/hooks/useRole";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Compass, RefreshCw, X, ChevronDown, ChevronUp, Loader2, ArrowRight, Info,
} from "lucide-react";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

type Counts = {
  overdue: number;
  due_today: number;
  untriaged: number;
  stale: number;
  fresh_captures: number;
  approvals: number;
  sherlock_pending: number;
  briefing_candidates: number;
  closed_today: number;
  slipped_today: number;
};

type Item = {
  kind: string;
  id: string;
  label: string;
  due_at?: string | null;
};

type Briefing = {
  headline: string;
  narrative: string | null;
  best_first_move: string;
  counts: Counts;
  items: Item[];
  role: Role;
  signals_hash: string;
  ai_skipped: boolean;
  generated_at: string;
  variant: string;
};

const CACHE_KEY = "vanta.briefing.cache.v1";

function partOfDay(now = new Date()): "morning" | "midday" | "evening" {
  const h = now.getHours();
  if (h < 11) return "morning";
  if (h < 17) return "midday";
  return "evening";
}

function loadCache(): Briefing | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Briefing) : null;
  } catch {
    return null;
  }
}

function saveCache(b: Briefing) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(b)); } catch { /* noop */ }
}

export function OperationsBriefingPanel({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session, user } = useAuth();
  const { timezone } = useUserTimezone();
  const role = useRole();

  const [briefing, setBriefing] = useState<Briefing | null>(() => loadCache());
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedThisSession = useRef(false);

  const compose = useCallback(async (manual: boolean) => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("briefing-compose", {
        body: {
          timezone,
          part_of_day: partOfDay(),
          if_match: manual ? null : (briefing?.signals_hash ?? null),
        },
      });
      if (invokeErr) throw invokeErr;
      const next = data as Briefing;
      // When the server short-circuits (ai_skipped + matching hash), keep the
      // narrative we already have — counts/items still update from the new row.
      if (next.ai_skipped && briefing && briefing.signals_hash === next.signals_hash) {
        const merged: Briefing = { ...next, narrative: briefing.narrative };
        setBriefing(merged);
        saveCache(merged);
      } else {
        setBriefing(next);
        saveCache(next);
      }
      if (user) {
        await supabase.from("audit_log").insert({
          user_id: user.id,
          entity_type: "briefing",
          event: manual ? "briefing.refreshed" : "briefing.viewed",
          payload: { signals_hash: next.signals_hash, ai_skipped: next.ai_skipped, role },
        });
      }
    } catch (e: any) {
      console.warn("briefing-compose failed", e);
      setError(e?.message ?? "Briefing unavailable");
    } finally {
      setLoading(false);
    }
  }, [session, user, timezone, role, briefing]);

  // Compose once per session — relies on if_match to avoid paid AI when nothing
  // changed. Role switch re-triggers (different permission scope).
  useEffect(() => {
    if (!session) return;
    if (fetchedThisSession.current) return;
    fetchedThisSession.current = true;
    compose(false);
  }, [session, role, compose]);

  if (dismissed) return null;

  const counts = briefing?.counts;
  const sourceLine = counts ? buildSourceLine(counts) : null;
  const newSignals = briefing && !briefing.ai_skipped;
  const updatedAgo = briefing ? formatDistanceToNow(new Date(briefing.generated_at), { addSuffix: true }) : null;

  return (
    <Card className="border-border/60 bg-surface-elevated/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3 w-3" /> Operations briefing
          {role !== "personal" && (
            <Badge variant="secondary" className="text-[9.5px] uppercase">{role}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
            onClick={() => compose(true)} disabled={loading}
            aria-label="Refresh briefing"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={async () => {
              setDismissed(true);
              if (user) await supabase.from("audit_log").insert({
                user_id: user.id, entity_type: "briefing", event: "briefing.dismissed",
                payload: { signals_hash: briefing?.signals_hash ?? null, role },
              });
            }}
            aria-label="Dismiss briefing"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!briefing && loading && (
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your signals…
        </div>
      )}

      {!briefing && !loading && error && (
        <p className="text-[12.5px] text-muted-foreground">
          Briefing unavailable. {error}
        </p>
      )}

      {briefing && (
        <>
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-foreground">{briefing.headline}</div>
            {briefing.narrative ? (
              <p className="text-[13px] leading-snug text-foreground/85">{briefing.narrative}</p>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                AI summary unavailable. Showing basic counts.
              </p>
            )}
          </div>

          {sourceLine && (
            <div className="text-[11px] text-muted-foreground">
              Based on: {sourceLine}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm" className="h-8 gap-1 text-[11.5px]"
              onClick={() => onNavigate(routeForBestMove(briefing))}
            >
              {labelForBestMove(briefing)} <ArrowRight className="h-3 w-3" />
            </Button>
            <Button
              size="sm" variant="ghost" className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowSources((s) => !s)}
            >
              <Info className="h-3 w-3" /> Why this matters
              {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              size="sm" variant="ghost" className="h-8 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowFull((s) => !s)}
            >
              {showFull ? "Quick" : "Full"}
            </Button>
          </div>

          {showSources && briefing.items.length > 0 && (
            <ul className="space-y-1 rounded-md border border-border/50 bg-background/30 p-2 text-[12px]">
              {briefing.items.slice(0, 8).map((i) => (
                <li key={`${i.kind}:${i.id}`} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                    {i.kind.replace("_", " ")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{i.label}</span>
                </li>
              ))}
            </ul>
          )}

          {showFull && (
            <div className="rounded-md border border-border/50 bg-background/30 p-2 text-[11.5px] text-muted-foreground">
              {fullBreakdown(briefing.counts)}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-[10.5px] text-muted-foreground">
            <span>
              {updatedAgo ? `Updated ${updatedAgo}` : "Updated just now"}
              {briefing.ai_skipped ? " · no new signals" : newSignals ? " · fresh" : ""}
            </span>
            <span className="truncate">Best move: {briefing.best_first_move}</span>
          </div>
        </>
      )}
    </Card>
  );
}

function buildSourceLine(c: Counts): string {
  const parts: string[] = [];
  if (c.overdue) parts.push(`${c.overdue} overdue`);
  if (c.due_today) parts.push(`${c.due_today} due today`);
  if (c.approvals) parts.push(`${c.approvals} awaiting approval`);
  if (c.untriaged) parts.push(`${c.untriaged} file${c.untriaged === 1 ? "" : "s"} to triage`);
  if (c.fresh_captures) parts.push(`${c.fresh_captures} fresh capture${c.fresh_captures === 1 ? "" : "s"}`);
  if (c.sherlock_pending) parts.push(`${c.sherlock_pending} Sherlock finding${c.sherlock_pending === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "no active signals";
}

function fullBreakdown(c: Counts): string {
  return [
    `Commitments: ${c.overdue} overdue, ${c.due_today} due today, ${c.stale} stale`,
    `Actions: ${c.approvals} awaiting approval`,
    `Files: ${c.untriaged} to triage, ${c.briefing_candidates} flagged`,
    `Captures: ${c.fresh_captures} fresh in last 24h`,
    `Sherlock: ${c.sherlock_pending} recent finding${c.sherlock_pending === 1 ? "" : "s"}`,
    `Closed today: ${c.closed_today} · slipped today: ${c.slipped_today}`,
  ].join(" · ");
}

function routeForBestMove(b: Briefing): SurfaceKey {
  const c = b.counts;
  if (c.overdue || c.due_today || c.stale) return "commitments";
  if (c.approvals) return "actions";
  if (c.untriaged || c.briefing_candidates) return "memory";
  if (c.sherlock_pending) return "sherlock";
  if (c.fresh_captures) return "memory";
  return "command";
}

function labelForBestMove(b: Briefing): string {
  const c = b.counts;
  if (c.overdue || c.stale) return "Review overdue";
  if (c.approvals) return "Review approvals";
  if (c.due_today) return "Open today";
  if (c.untriaged || c.briefing_candidates) return "Triage files";
  if (c.sherlock_pending) return "Open Sherlock";
  if (c.fresh_captures) return "Open captures";
  return "Open commitments";
}
