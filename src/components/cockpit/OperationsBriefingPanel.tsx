// OperationsBriefingPanel — the dashboard's plain-English shift report.
//
// Reads from briefing-compose (which gates sources by role *before* querying,
// so the AI never sees data the user isn't allowed to see). Caches the last
// response and re-uses it when `signals_hash` matches — no paid AI calls on
// render, focus, or refresh-without-change.
//
// Live Capture stays the receipt roll; this card is the story.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useRole, type Role } from "@/hooks/useRole";
import { useWorkspace, scopeLabel as workspaceScopeLabel } from "@/providers/WorkspaceProvider";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Compass, RefreshCw, X, ChevronDown, ChevronUp, Loader2, ArrowRight, Info, ShieldCheck,
} from "lucide-react";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { humanizeBriefingItem, renderPlainLine, displayKind, displayPlatform as displayPlatformPE } from "@/lib/plainEnglish";
import { AftermathFooter } from "@/components/aftermath/AftermathFooter";
import { WhatIsThis } from "@/components/tutorial/WhatIsThis";

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
  external_signals: number;
  external_by_source: Record<string, number>;
};

type Item = {
  kind: string;
  id: string;
  label: string;
  due_at?: string | null;
  source?: string;
};

const PLATFORM_DISPLAY: Record<string, string> = {
  ground_truth_hub: "LMT Camp State",
  campcore: "CampCore",
  fenrir_lock: "Fenrir",
  website_forms: "Website",
  telegram: "Telegram",
  email: "Email",
};
const displayPlatform = (k: string) => PLATFORM_DISPLAY[k] ?? k;

type UsefulConnection = {
  id: string;
  summary: string;
  confidence: string;
  suggested_action: string | null;
  source_kind: string | null;
  target_kind: string | null;
};

type Sections = {
  people: number; operations: number; time: number; files: number;
  notes: number; sherlock: number; integrations: number; system: number;
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
  // doctrine v2
  verdict?: string;
  what_changed?: string[];
  what_matters?: string[];
  useful_connections?: UsefulConnection[];
  source_grounding?: Record<string, unknown>;
  sections?: Sections;
};

const CACHE_KEY = "vanta.briefing.cache.v1";
const LAST_SEEN_KEY = "vanta.briefing.lastSeenHash.v1";

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

function scopeLabel(role: Role): string {
  switch (role) {
    case "owner": return "Admin · all workspaces";
    case "manager": return "Manager";
    case "coach": return "Coach";
    case "viewer": return "Viewer · read-only";
    case "personal":
    default: return "Personal";
  }
}

export function OperationsBriefingPanel({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session, user } = useAuth();
  const { timezone } = useUserTimezone();
  const role = useRole();
  const { scope, activeMembership } = useWorkspace();
  const scopeText = workspaceScopeLabel(scope, activeMembership);

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
          scope: scope.kind === "workspace"
            ? { kind: "workspace", organization_id: scope.organization_id }
            : { kind: scope.kind },
        },
      });
      if (invokeErr) throw invokeErr;
      const next = data as Briefing;
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
          payload: { signals_hash: next.signals_hash, ai_skipped: next.ai_skipped, role, scope: scope.kind },
          organization_id: scope.kind === "workspace" ? scope.organization_id : null,
        });
      }
    } catch (e: any) {
      console.warn("briefing-compose failed", e);
      setError(e?.message ?? "Briefing unavailable");
    } finally {
      setLoading(false);
    }
  }, [session, user, timezone, role, briefing, scope]);

  useEffect(() => {
    if (!session) return;
    // Re-fetch whenever scope changes so we never show another lane's data.
    fetchedThisSession.current = false;
  }, [scope]);

  useEffect(() => {
    if (!session) return;
    if (fetchedThisSession.current) return;
    fetchedThisSession.current = true;
    compose(false);
  }, [session, role, compose, scope]);

  // Track "new since last viewed" for trust footer.
  const newSinceLastSeen = useMemo(() => {
    if (!briefing || typeof window === "undefined") return 0;
    try {
      const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
      if (lastSeen === briefing.signals_hash) return 0;
      // count net "fresh" signals as the delta proxy.
      return (briefing.counts.fresh_captures ?? 0) + (briefing.counts.external_signals ?? 0);
    } catch { return 0; }
  }, [briefing]);

  useEffect(() => {
    if (!briefing || typeof window === "undefined") return;
    const t = setTimeout(() => {
      try { window.localStorage.setItem(LAST_SEEN_KEY, briefing.signals_hash); } catch { /* noop */ }
    }, 2500);
    return () => clearTimeout(t);
  }, [briefing]);

  if (dismissed) return null;

  const counts = briefing?.counts;
  const chips = counts ? buildChips(counts) : [];
  const sourceLine = counts ? buildSourceLine(counts) : null;
  const updatedAgo = briefing ? formatDistanceToNow(new Date(briefing.generated_at), { addSuffix: true }) : null;
  const quiet = counts ? isQuiet(counts) : false;

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-surface-elevated/70 p-4 space-y-3",
        "shadow-[0_1px_0_0_hsl(var(--border)/0.4),0_8px_24px_-12px_hsl(var(--background)/0.6)]",
        "motion-fade",
      )}
      aria-label="Operations briefing"
    >
      {/* faint operator texture, kept very subtle */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(hsl(var(--foreground))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground))_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3 w-3 shrink-0" />
          <span className="truncate">Today's read</span>
          <WhatIsThis topic="operations_briefing" />
          <Badge variant="secondary" className="shrink-0 text-[9.5px] font-normal uppercase tracking-wider">
            {scopeText}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
            onClick={() => compose(true)} disabled={loading}
            aria-label="Refresh briefing"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="hidden xs:inline">Refresh</span>
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
        <div className="relative space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted/30" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted/20" />
        </div>
      )}

      {!briefing && !loading && error && (
        <p className="relative text-[12.5px] text-muted-foreground">
          Briefing unavailable. {error}
        </p>
      )}

      {briefing && (
        <div className="relative space-y-3">

          {/* Verdict (doctrine: lead with meaning, never counts) */}
          <div className="space-y-1.5 motion-fade">
            <div className="text-[15px] font-medium leading-snug text-foreground">
              {briefing.verdict || briefing.headline || (quiet ? "Everything is calm." : "Here's the shift.")}
            </div>
            {briefing.what_changed && briefing.what_changed.length > 0 ? (
              <ul className="space-y-0.5 text-[12.5px] leading-relaxed text-foreground/85">
                {briefing.what_changed.map((line, i) => (
                  <li key={i} className="before:mr-1.5 before:text-muted-foreground/60 before:content-['·']">{line}</li>
                ))}
              </ul>
            ) : briefing.narrative ? (
              <p className="text-[13px] leading-relaxed text-foreground/85">{briefing.narrative}</p>
            ) : quiet ? (
              <p className="text-[12.5px] text-muted-foreground">
                Nothing important in your lane right now. Live Capture is still watching.
              </p>
            ) : null}
            {briefing.what_matters && briefing.what_matters.length > 0 && (
              <div className="mt-1 rounded-md border border-border/40 bg-background/30 p-2">
                <div className="mb-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">What needs you</div>
                <ul className="space-y-0.5 text-[12px] text-foreground/85">
                  {briefing.what_matters.map((line, i) => (<li key={i}>{line}</li>))}
                </ul>
              </div>
            )}
          </div>

          {/* Useful connections (Sherlock, plain English, no jargon) */}
          {briefing.useful_connections && briefing.useful_connections.length > 0 && (
            <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-2 motion-fade">
              <div className="flex items-center justify-between gap-2 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                <span>Heads-ups worth a look</span>
                <span className="font-normal normal-case text-[10px] text-muted-foreground/70">Spotted by Echo</span>
              </div>
              <ul className="space-y-1">
                {briefing.useful_connections.map((u) => (
                  <li key={u.id} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-primary/80">
                      {u.confidence}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate("sherlock")}
                      className="min-w-0 flex-1 text-left text-foreground/90 hover:text-foreground"
                    >
                      <span className="block truncate">{u.summary}</span>
                      <span className="block text-[10.5px] text-muted-foreground">
                        Next: take a look in Sherlock — nothing's been changed.
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source-grounding chips — receipts, smaller and below verdict */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 motion-fade">
              <span className="self-center text-[9.5px] uppercase tracking-wider text-muted-foreground">
                Based on
              </span>
              {chips.map((chip, i) => (
                <span
                  key={chip.key}
                  style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] motion-fade",
                    chipTone(chip.tone),
                  )}
                >
                  <span className="font-medium">{chip.label}</span>
                  <span className="text-foreground/60">·</span>
                  <span className="tabular-nums">{chip.value}</span>
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              size="sm" className="h-8 gap-1 text-[11.5px] motion-fade"
              onClick={() => onNavigate(routeForBestMove(briefing))}
            >
              {labelForBestMove(briefing)} <ArrowRight className="h-3 w-3" />
            </Button>
            <Button
              size="sm" variant="ghost" className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowSources((s) => !s)}
              aria-expanded={showSources}
            >
              <Info className="h-3 w-3" /> Why this appears here
              {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              size="sm" variant="ghost" className="h-8 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowFull((s) => !s)}
              aria-expanded={showFull}
            >
              {showFull ? "Less" : "More"}
            </Button>
          </div>

          {/* Source trail */}
          {showSources && (
            <div className="motion-fade">
              {briefing.items.length > 0 ? (
                <ul className="space-y-1.5 rounded-md border border-border/50 bg-background/30 p-2 text-[12px]">
                  {briefing.items.slice(0, 8).map((i) => {
                    const ev = humanizeBriefingItem(i);
                    const dest = routeForKind(i.kind);
                    return (
                      <li key={`${i.kind}:${i.id}`} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          {i.kind === "external_signal" && i.source ? displayPlatformPE(i.source) : displayKind(i.kind)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-foreground/90">{renderPlainLine(ev)}</div>
                          <button
                            type="button"
                            onClick={() => onNavigate(dest)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                          >
                            <span className="text-[9.5px] uppercase tracking-wider">Next</span>
                            <span>Open in {labelForSurface(dest)}</span>
                            <ArrowRight className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-border/50 bg-background/30 p-2 text-[11.5px] text-muted-foreground">
                  No tracked items behind this summary yet.
                </p>
              )}
            </div>
          )}

          {showFull && (
            <div className="motion-fade rounded-md border border-border/50 bg-background/30 p-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {fullBreakdown(briefing.counts)}
            </div>
          )}

          {/* Trust footer */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Based on signals you can access
            </span>
            <span className="tabular-nums">
              {updatedAgo ? `Updated ${updatedAgo}` : "Updated just now"}
              {briefing.ai_skipped
                ? " · cached"
                : newSinceLastSeen > 0
                  ? ` · ${newSinceLastSeen} new`
                  : ""}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

type Chip = { key: string; label: string; value: string | number; tone: "calm" | "active" | "warn" | "quiet" };

function buildChips(c: Counts): Chip[] {
  const chips: Chip[] = [];
  for (const [src, n] of Object.entries(c.external_by_source ?? {})) {
    if (!n) continue;
    chips.push({ key: `ext:${src}`, label: displayPlatform(src), value: n, tone: "active" });
  }
  if (c.overdue) chips.push({ key: "overdue", label: "Overdue", value: c.overdue, tone: "warn" });
  if (c.due_today) chips.push({ key: "due", label: "Due today", value: c.due_today, tone: "active" });
  if (c.approvals) chips.push({ key: "approvals", label: "Approvals", value: c.approvals, tone: "active" });
  if (c.untriaged) chips.push({ key: "files", label: "Files", value: c.untriaged, tone: "active" });
  if (c.sherlock_pending) chips.push({ key: "sherlock", label: "Sherlock", value: c.sherlock_pending, tone: "active" });
  if (c.fresh_captures && chips.length < 6) {
    chips.push({ key: "captures", label: "Captures", value: c.fresh_captures, tone: "calm" });
  }
  return chips.slice(0, 8);
}

function chipTone(tone: Chip["tone"]): string {
  switch (tone) {
    case "warn":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "active":
      return "border-primary/30 bg-primary/10 text-foreground";
    case "calm":
      return "border-border/60 bg-muted/30 text-muted-foreground";
    case "quiet":
    default:
      return "border-border/50 bg-background/40 text-muted-foreground";
  }
}

function isQuiet(c: Counts): boolean {
  return !(c.overdue || c.due_today || c.approvals || c.untriaged || c.sherlock_pending || c.external_signals || c.fresh_captures);
}

function buildSourceLine(c: Counts): string {
  const parts: string[] = [];
  if (c.overdue) parts.push(`${c.overdue} overdue`);
  if (c.due_today) parts.push(`${c.due_today} due today`);
  if (c.approvals) parts.push(`${c.approvals} awaiting approval`);
  if (c.untriaged) parts.push(`${c.untriaged} file${c.untriaged === 1 ? "" : "s"} to triage`);
  if (c.fresh_captures) parts.push(`${c.fresh_captures} fresh capture${c.fresh_captures === 1 ? "" : "s"}`);
  if (c.sherlock_pending) parts.push(`${c.sherlock_pending} Sherlock finding${c.sherlock_pending === 1 ? "" : "s"}`);
  for (const [src, n] of Object.entries(c.external_by_source ?? {})) {
    parts.push(`${n} from ${displayPlatform(src)}`);
  }
  return parts.length ? parts.join(" · ") : "no active signals";
}

function fullBreakdown(c: Counts): string {
  const ext = Object.entries(c.external_by_source ?? {})
    .map(([s, n]) => `${displayPlatform(s)}: ${n}`).join(", ") || "none";
  return [
    `Commitments: ${c.overdue} overdue, ${c.due_today} due today, ${c.stale} stale`,
    `Actions: ${c.approvals} awaiting approval`,
    `Files: ${c.untriaged} to triage, ${c.briefing_candidates} flagged`,
    `Captures: ${c.fresh_captures} fresh in last 24h`,
    `Sherlock: ${c.sherlock_pending} recent finding${c.sherlock_pending === 1 ? "" : "s"}`,
    `External signals: ${c.external_signals} (${ext})`,
    `Closed today: ${c.closed_today} · slipped today: ${c.slipped_today}`,
  ].join(" · ");
}

function routeForBestMove(b: Briefing): SurfaceKey {
  const c = b.counts;
  if (c.overdue || c.due_today || c.stale) return "commitments";
  if (c.approvals) return "actions";
  if (c.external_signals) return "memory";
  if (c.untriaged || c.briefing_candidates) return "memory";
  if (c.sherlock_pending) return "sherlock";
  if (c.fresh_captures) return "memory";
  return "command";
}

function labelForBestMove(b: Briefing): string {
  const c = b.counts;
  if (c.overdue || c.stale) return "Review overdue";
  if (c.approvals) return "Review approvals";
  if (c.external_signals) return "Open new signals";
  if (c.due_today) return "Open today";
  if (c.untriaged || c.briefing_candidates) return "Triage files";
  if (c.sherlock_pending) return "Open Sherlock";
  if (c.fresh_captures) return "Open captures";
  return "Open commitments";
}

function routeForKind(kind: string): SurfaceKey {
  switch (kind) {
    case "commitment": return "commitments";
    case "action": return "actions";
    case "sherlock_finding": return "sherlock";
    case "file":
    case "capture":
    case "message":
    case "external_signal": return "memory";
    case "reminder": return "schedule";
    default: return "command";
  }
}

function labelForSurface(s: SurfaceKey): string {
  switch (s) {
    case "commitments": return "Commitments";
    case "actions": return "Actions";
    case "sherlock": return "Sherlock";
    case "memory": return "Memory";
    case "schedule": return "Schedule";
    case "receipts": return "Receipts";
    case "awareness": return "Awareness";
    case "ask": return "Echo";
    case "command":
    default: return "Command";
  }
}
