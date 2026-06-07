// DailyChecklistCard — top of Command Center.
// Three calm sections:
//   Needs you · What changed · Suggested next
// Each item routes to the right surface. Dismissable per-day via localStorage.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckSquare, AlertTriangle, ShieldAlert, History, ArrowRight, Sparkles, ListChecks, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { humanizeEvent, kindLabel } from "@/lib/plainLabels";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

type ChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  surface: SurfaceKey;
  icon: typeof CheckSquare;
  tone: "needs" | "changed" | "next";
};

const DISMISS_KEY = "vanta:checklist:dismissed";

function todayKey() { return new Date().toISOString().slice(0, 10); }

function loadDismissed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}");
    if (raw?.date === todayKey()) return new Set(raw.ids ?? []);
  } catch { /* noop */ }
  return new Set();
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify({ date: todayKey(), ids: Array.from(ids) }));
}

export function DailyChecklistCard({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session } = useAuth();
  const [needs, setNeeds] = useState<ChecklistItem[]>([]);
  const [changed, setChanged] = useState<ChecklistItem[]>([]);
  const [next, setNext] = useState<ChecklistItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [overdue, highRisk, sherlock, recent] = await Promise.all([
        supabase.from("commitments")
          .select("id, summary, due_at")
          .eq("user_id", session.user.id).neq("status", "done")
          .lt("due_at", startOfDay.toISOString())
          .order("due_at", { ascending: true }).limit(5),
        supabase.from("actions")
          .select("id, title")
          .eq("user_id", session.user.id).in("status", ["staged", "proposed"]).eq("risk", "high")
          .order("updated_at", { ascending: false }).limit(5),
        supabase.from("sherlock_findings")
          .select("id, summary")
          .eq("user_id", session.user.id).eq("status", "pending")
          .order("updated_at", { ascending: false }).limit(5),
        supabase.from("audit_log")
          .select("id, event, entity_type, created_at")
          .eq("user_id", session.user.id).gte("created_at", dayAgo)
          .order("created_at", { ascending: false }).limit(8),
      ]);
      if (cancelled) return;

      const needsItems: ChecklistItem[] = [
        ...(overdue.data ?? []).map((c: any) => ({
          id: `commit:${c.id}`,
          label: c.summary,
          detail: c.due_at ? `Overdue · ${formatDistanceToNow(new Date(c.due_at), { addSuffix: true })}` : "Overdue",
          surface: "commitments" as SurfaceKey,
          icon: AlertTriangle,
          tone: "needs" as const,
        })),
        ...(highRisk.data ?? []).map((a: any) => ({
          id: `action:${a.id}`,
          label: a.title,
          detail: "High-risk action needs approval",
          surface: "actions" as SurfaceKey,
          icon: ShieldAlert,
          tone: "needs" as const,
        })),
        ...(sherlock.data ?? []).map((s: any) => ({
          id: `sherlock:${s.id}`,
          label: s.summary || "Open Sherlock finding",
          detail: "Pending Sherlock review",
          surface: "sherlock" as SurfaceKey,
          icon: ShieldAlert,
          tone: "needs" as const,
        })),
      ];

      const changedItems: ChecklistItem[] = (recent.data ?? []).slice(0, 5).map((r: any) => ({
        id: `audit:${r.id}`,
        label: humanizeEvent(r.event),
        detail: `${kindLabel(r.entity_type)} · ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`,
        surface: "receipts" as SurfaceKey,
        icon: History,
        tone: "changed" as const,
      }));

      // Suggested next moves — derive from what was found.
      const nextItems: ChecklistItem[] = [];
      if ((overdue.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:overdue", label: "Work an overdue commitment", surface: "commitments", icon: CheckSquare, tone: "next" });
      if ((highRisk.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:risk", label: "Approve a high-risk action", surface: "actions", icon: ListChecks, tone: "next" });
      if ((sherlock.data?.length ?? 0) > 0)
        nextItems.push({ id: "next:sherlock", label: "Clear a Sherlock finding", surface: "sherlock", icon: ShieldAlert, tone: "next" });
      if (nextItems.length === 0)
        nextItems.push({ id: "next:capture", label: "Capture a thought into your Inbox", surface: "memory", icon: Sparkles, tone: "next" });

      setNeeds(needsItems);
      setChanged(changedItems);
      setNext(nextItems.slice(0, 3));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const visibleNeeds = useMemo(() => needs.filter((i) => !dismissed.has(i.id)), [needs, dismissed]);
  const visibleChanged = useMemo(() => changed.filter((i) => !dismissed.has(i.id)), [changed, dismissed]);

  function dismiss(id: string) {
    const n = new Set(dismissed); n.add(id);
    setDismissed(n); saveDismissed(n);
  }

  if (loading) return null;

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
        <Badge variant="secondary" className="text-[10px]">
          {visibleNeeds.length + visibleChanged.length + next.length} items
        </Badge>
      </header>

      <Section title="Needs you" emptyHint="Nothing waiting on you right now. Nice." items={visibleNeeds} onOpen={onNavigate} onDismiss={dismiss} />
      <Section title="What changed" emptyHint="No activity in the last 24h. Capture a note to start one." items={visibleChanged} onOpen={onNavigate} onDismiss={dismiss} />
      <Section title="Suggested next" emptyHint="" items={next} onOpen={onNavigate} onDismiss={null} />
    </Card>
  );
}

function Section({
  title, emptyHint, items, onOpen, onDismiss,
}: {
  title: string;
  emptyHint: string;
  items: ChecklistItem[];
  onOpen: (k: SurfaceKey) => void;
  onDismiss: ((id: string) => void) | null;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        emptyHint ? <p className="text-[11.5px] text-muted-foreground">{emptyHint}</p> : null
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.id} className="flex items-start gap-2 rounded-md border border-border/40 bg-background/30 p-2 text-[12.5px]">
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
                  aria-label={`Open ${title}`}
                >
                  Open <ArrowRight className="ml-0.5 h-3 w-3" />
                </Button>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(it.id)}
                    aria-label="Dismiss for today"
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
