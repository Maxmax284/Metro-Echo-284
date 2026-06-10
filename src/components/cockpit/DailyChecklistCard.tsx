// DailyChecklistCard — top of Command Center.
// Three calm sections: Needs you · What changed · Suggested next.
//
// Slice 6 wiring: dismissals persist across sessions/devices via
// intake_dismissals, the section limit and visibility window come from
// IntakePrefs, and anything older than the window collapses into an
// expandable "older" group instead of staring at you forever.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckSquare,
  AlertTriangle,
  ShieldAlert,
  History,
  ArrowRight,
  Sparkles,
  ListChecks,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { humanizeEvent, kindLabel } from "@/lib/plainLabels";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { useIntakePrefs } from "@/hooks/useIntakePrefs";
import { useIntakeDismissals } from "@/hooks/useIntakeDismissals";
import { keyFor } from "@/lib/intakeLifecycle";
import { isStaleCommitment } from "@/lib/commitmentLifecycle";

type Tone = "needs" | "changed" | "next";
type DismissKind =
  | "commitment"
  | "action"
  | "sherlock"
  | "audit"
  | null;

type ChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  surface: SurfaceKey;
  icon: typeof CheckSquare;
  tone: Tone;
  ts?: string; // for staleness
  dismissKind: DismissKind;
  dismissId?: string;
};

export function DailyChecklistCard({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session } = useAuth();
  const { intake } = useIntakePrefs();
  const { dismissed, dismiss } = useIntakeDismissals();
  const [needs, setNeeds] = useState<ChecklistItem[]>([]);
  const [changed, setChanged] = useState<ChecklistItem[]>([]);
  const [next, setNext] = useState<ChecklistItem[]>([]);
  const [overdueMeta, setOverdueMeta] = useState({ total: 0, stale: 0, visible: 0, capped: 0 });
  const [loading, setLoading] = useState(true);
  const [showOlderNeeds, setShowOlderNeeds] = useState(false);
  const [showOlderChanged, setShowOlderChanged] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [overdue, highRisk, sherlock, recent] = await Promise.all([
        supabase.from("commitments")
          .select("id, summary, due_at, updated_at, status")
          .eq("user_id", session.user.id).neq("status", "done")
          .lt("due_at", startOfDay.toISOString())
          .order("due_at", { ascending: true }).limit(50),
        supabase.from("actions")
          .select("id, title, updated_at")
          .eq("user_id", session.user.id).in("status", ["staged", "proposed"]).eq("risk", "high")
          .order("updated_at", { ascending: false }).limit(20),
        supabase.from("sherlock_findings")
          .select("id, summary, updated_at")
          .eq("user_id", session.user.id).eq("status", "pending")
          .order("updated_at", { ascending: false }).limit(20),
        supabase.from("audit_log")
          .select("id, event, entity_type, created_at")
          .eq("user_id", session.user.id).gte("created_at", dayAgo)
          .order("created_at", { ascending: false }).limit(20),
      ]);
      if (cancelled) return;

      // Filter overdue commitments through the stale window. Stale ones go to
      // the Stale tray on the Commitments surface — they don't shout here.
      const staleDays = intake.commitment_stale_days;
      const visibleOverdue =
        intake.commitment_stale_behavior === "tray"
          ? (overdue.data ?? []).filter(
              (c: any) => !isStaleCommitment(c as any, staleDays),
            )
          : (overdue.data ?? []);

      // Hard cap on overdue items in the Today card. Past the cap, the user
      // sees a "+N more" pointer into the Commitments surface.
      const cappedOverdue = visibleOverdue.slice(0, intake.today_card_overdue_limit);

      const needsItems: ChecklistItem[] = [
        ...cappedOverdue.map((c: any) => ({
          id: `commit:${c.id}`,
          label: c.summary,
          detail: c.due_at ? `Overdue · ${formatDistanceToNow(new Date(c.due_at), { addSuffix: true })}` : "Overdue",
          surface: "commitments" as SurfaceKey,
          icon: AlertTriangle,
          tone: "needs" as const,
          ts: c.due_at ?? c.updated_at,
          dismissKind: "commitment" as const,
          dismissId: c.id,
        })),
        ...(highRisk.data ?? []).map((a: any) => ({
          id: `action:${a.id}`,
          label: a.title,
          detail: "High-risk action needs approval",
          surface: "actions" as SurfaceKey,
          icon: ShieldAlert,
          tone: "needs" as const,
          ts: a.updated_at,
          dismissKind: "action" as const,
          dismissId: a.id,
        })),
        ...(sherlock.data ?? []).map((s: any) => ({
          id: `sherlock:${s.id}`,
          label: s.summary || "Open Sherlock finding",
          detail: "Pending Sherlock review",
          surface: "sherlock" as SurfaceKey,
          icon: ShieldAlert,
          tone: "needs" as const,
          ts: s.updated_at,
          dismissKind: "sherlock" as const,
          dismissId: s.id,
        })),
      ];

      const changedItems: ChecklistItem[] = (recent.data ?? []).map((r: any) => ({
        id: `audit:${r.id}`,
        label: humanizeEvent(r.event),
        detail: `${kindLabel(r.entity_type)} · ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`,
        surface: "receipts" as SurfaceKey,
        icon: History,
        tone: "changed" as const,
        ts: r.created_at,
        dismissKind: "audit" as const,
        dismissId: r.id,
      }));

      const nextItems: ChecklistItem[] = [];
      if ((overdue.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:overdue", label: "Work an overdue commitment", surface: "commitments", icon: CheckSquare, tone: "next", dismissKind: null });
      if ((highRisk.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:risk", label: "Approve a high-risk action", surface: "actions", icon: ListChecks, tone: "next", dismissKind: null });
      if ((sherlock.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:sherlock", label: "Clear a Sherlock finding", surface: "sherlock", icon: ShieldAlert, tone: "next", dismissKind: null });
      if (nextItems.length === 0)
        nextItems.push({ id: "next:capture", label: "Capture a thought into your Inbox", surface: "memory", icon: Sparkles, tone: "next", dismissKind: null });

      setNeeds(needsItems);
      setChanged(changedItems);
      setNext(nextItems.slice(0, 3));
      setOverdueMeta({
        total: overdue.data?.length ?? 0,
        stale: (overdue.data?.length ?? 0) - visibleOverdue.length,
        visible: visibleOverdue.length,
        capped: Math.max(0, visibleOverdue.length - cappedOverdue.length),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, intake.commitment_stale_days, intake.commitment_stale_behavior, intake.today_card_overdue_limit]);

  const windowDays = intake.capture_visibility_days;
  const limit = intake.command_center_section_limit;
  const now = Date.now();
  const ageDays = (ts?: string) =>
    ts ? (now - new Date(ts).getTime()) / 86_400_000 : 0;

  function isDismissed(it: ChecklistItem) {
    if (!it.dismissKind || !it.dismissId) return false;
    return dismissed.has(keyFor(it.dismissKind, it.dismissId));
  }

  const { freshNeeds, olderNeeds } = useMemo(() => {
    const live = needs.filter((i) => !isDismissed(i));
    const fresh = live.filter((i) => ageDays(i.ts) <= windowDays).slice(0, limit);
    const older = live.filter((i) => ageDays(i.ts) > windowDays);
    return { freshNeeds: fresh, olderNeeds: older };
  }, [needs, dismissed, windowDays, limit]);

  const { freshChanged, olderChanged } = useMemo(() => {
    const live = changed.filter((i) => !isDismissed(i));
    const fresh = live.filter((i) => ageDays(i.ts) <= windowDays).slice(0, limit);
    const older = live.filter((i) => ageDays(i.ts) > windowDays);
    return { freshChanged: fresh, olderChanged: older };
  }, [changed, dismissed, windowDays, limit]);

  function handleDismiss(it: ChecklistItem) {
    if (!it.dismissKind || !it.dismissId) return;
    void dismiss(it.dismissKind, it.dismissId, {
      reason: "command_center_dismiss",
      payload: { label: it.label, surface: it.surface, tone: it.tone },
    });
  }

  if (loading) return null;

  const totalVisible =
    freshNeeds.length + freshChanged.length + next.length +
    (showOlderNeeds ? olderNeeds.length : 0) +
    (showOlderChanged ? olderChanged.length : 0);

  return (
    <Card className="space-y-3 border-border/60 bg-surface-elevated/60 p-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <CheckSquare className="h-3 w-3" /> Today
          </div>
          <p className="text-[12px] text-foreground/85">
            What needs you, what changed, what to do next.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px]">{totalVisible} items</Badge>
      </header>

      <Section
        title="Needs you"
        emptyHint="Nothing waiting on you right now. Nice."
        items={freshNeeds}
        onOpen={onNavigate}
        onDismiss={handleDismiss}
      />
      {olderNeeds.length > 0 && (
        <OlderToggle
          count={olderNeeds.length}
          open={showOlderNeeds}
          onToggle={() => setShowOlderNeeds((v) => !v)}
          label={`older than ${windowDays} day${windowDays === 1 ? "" : "s"}`}
        />
      )}
      {showOlderNeeds && olderNeeds.length > 0 && (
        <Section title="" emptyHint="" items={olderNeeds} onOpen={onNavigate} onDismiss={handleDismiss} muted />
      )}

      <Section
        title="What changed"
        emptyHint="No activity in the last 24h. Capture a note to start one."
        items={freshChanged}
        onOpen={onNavigate}
        onDismiss={handleDismiss}
      />
      {olderChanged.length > 0 && (
        <OlderToggle
          count={olderChanged.length}
          open={showOlderChanged}
          onToggle={() => setShowOlderChanged((v) => !v)}
          label={`older than ${windowDays} day${windowDays === 1 ? "" : "s"}`}
        />
      )}
      {showOlderChanged && olderChanged.length > 0 && (
        <Section title="" emptyHint="" items={olderChanged} onOpen={onNavigate} onDismiss={handleDismiss} muted />
      )}

      <Section title="Suggested next" emptyHint="" items={next} onOpen={onNavigate} onDismiss={null} />
    </Card>
  );
}

function OlderToggle({
  count, open, onToggle, label,
}: { count: number; open: boolean; onToggle: () => void; label: string }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-3 w-3" />
      {open ? "Hide" : "Show"} {count} {label}
    </button>
  );
}

function Section({
  title, emptyHint, items, onOpen, onDismiss, muted,
}: {
  title: string;
  emptyHint: string;
  items: ChecklistItem[];
  onOpen: (k: SurfaceKey) => void;
  onDismiss: ((it: ChecklistItem) => void) | null;
  muted?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {title ? (
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{title}</div>
      ) : null}
      {items.length === 0 ? (
        emptyHint ? <p className="text-[11.5px] text-muted-foreground">{emptyHint}</p> : null
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li
                key={it.id}
                className={
                  "flex items-start gap-2 rounded-md border border-border/40 bg-background/30 p-2 text-[12.5px]" +
                  (muted ? " opacity-70" : "")
                }
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <button
                  onClick={() => onOpen(it.surface)}
                  className="min-w-0 flex-1 text-left hover:text-foreground"
                >
                  <div className="truncate text-foreground/95">{it.label}</div>
                  {it.detail && <div className="text-[10.5px] text-muted-foreground">{it.detail}</div>}
                </button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-1.5 text-[10.5px]"
                  onClick={() => onOpen(it.surface)}
                  aria-label="Open"
                >
                  Open <ArrowRight className="ml-0.5 h-3 w-3" />
                </Button>
                {onDismiss && it.dismissKind && (
                  <button
                    onClick={() => onDismiss(it)}
                    aria-label="Dismiss"
                    className="h-6 w-6 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
