import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { SherlockHintChip } from "@/components/sherlock/SherlockHintChip";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { Loader2, ShieldAlert, ShieldCheck, Shield, CheckSquare, ListChecks,
  Inbox, Search, Notebook, ScrollText, Compass, ArrowRight, Sparkles, Network, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { AwareCockpitCard } from "@/components/shell/AwareCockpitCard";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { useCanvas } from "@/components/entities/CanvasContext";
import { ProductivityPulseCard } from "@/components/cockpit/ProductivityPulseCard";
import { OperationsBriefingPanel } from "@/components/cockpit/OperationsBriefingPanel";
import { ProjectRollupCards } from "@/components/cockpit/ProjectRollupCards";
import { DailyChecklistCard } from "@/components/cockpit/DailyChecklistCard";
import { BriefComposerSheet } from "@/components/briefs/BriefComposerSheet";
import { BriefExportsList } from "@/components/briefs/BriefExportsList";
import { useIsOwner } from "@/hooks/useIsOwner";
import { WhatIsThis } from "@/components/tutorial/WhatIsThis";
import type { BriefFormat } from "@/lib/briefs";

type Counts = {
  pendingApprovals: number;
  highRisk: number;
  openCommitments: number;
  overdueCommitments: number;
  sherlockFlags: number;
  recentCaptures: number;
  executedToday: number;
};

type ActionRow = {
  id: string; title: string; risk: "low_reversible" | "standard" | "high";
  status: string; updated_at: string;
};
type CommitmentRow = {
  id: string; summary: string; due_at: string | null; status: string; priority: string;
};
type CaptureRow = {
  id: string; kind: "message" | "file" | "note";
  label: string; ts: string; source?: string | null;
};
type AuditRow = { id: string; event: string; entity_type: string; created_at: string };

const RiskIcon = { low_reversible: ShieldCheck, standard: Shield, high: ShieldAlert } as const;
const riskTone = { low_reversible: "text-signal", standard: "text-primary", high: "text-warn" } as const;

export function CommandCenterSurface({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session } = useAuth();
  const { openSherlock } = useSherlock();
  const { openCanvas } = useCanvas();
  const isOwner = useIsOwner();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({
    pendingApprovals: 0, highRisk: 0, openCommitments: 0, overdueCommitments: 0,
    sherlockFlags: 0, recentCaptures: 0, executedToday: 0,
  });
  const [approvals, setApprovals] = useState<ActionRow[]>([]);
  const [today, setToday] = useState<CommitmentRow[]>([]);
  const [overdue, setOverdue] = useState<CommitmentRow[]>([]);
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [findings, setFindings] = useState<{ id: string; entity_type: string; summary: string; confidence: string | null; updated_at: string }[]>([]);
  const [receipts, setReceipts] = useState<AuditRow[]>([]);
  const [pendingById, setPendingById] = useState<Map<string, SherlockFinding>>(new Map());
  const [briefOpen, setBriefOpen] = useState(false);

  useEffect(() => { if (session) refresh(); /* eslint-disable-next-line */ }, [session]);

  async function refresh() {
    setLoading(true);
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const [acts, commits, recentMsgs, recentFiles, sherlock, audit, sherlockPending] = await Promise.all([
      supabase.from("actions")
        .select("id, title, risk, status, updated_at")
        .in("status", ["staged", "proposed"])
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase.from("commitments")
        .select("id, summary, due_at, status, priority")
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(50),
      supabase.from("messages")
        .select("id, role, content, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("ingested_files")
        .select("id, filename, source, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("sherlock_findings_cache")
        .select("id, entity_type, findings, confidence, updated_at")
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase.from("audit_log")
        .select("id, event, entity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("sherlock_findings")
        .select("id, source_object_id, source_object_type, mode, summary, confidence, suggested_action")
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

    const actions = (acts.data ?? []) as ActionRow[];
    const allCommits = (commits.data ?? []) as CommitmentRow[];
    const overdueList = allCommits.filter(c => c.due_at && new Date(c.due_at) < startOfDay);
    const todayList = allCommits.filter(c => c.due_at && new Date(c.due_at) >= startOfDay && new Date(c.due_at) <= endOfDay);
    const msgsAsCaptures: CaptureRow[] = (recentMsgs.data ?? [])
      .filter((m: any) => m.role === "user")
      .slice(0, 5)
      .map((m: any) => ({ id: m.id, kind: "message", label: m.content.slice(0, 90), ts: m.created_at, source: (m.metadata as any)?.source ?? "chat" }));
    const fileCaptures: CaptureRow[] = (recentFiles.data ?? []).slice(0, 5).map((f: any) => ({
      id: f.id, kind: "file", label: f.filename, ts: f.created_at, source: f.source,
    }));
    const merged = [...msgsAsCaptures, ...fileCaptures].sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 6);

    const executedTodayCount = (audit.data ?? []).filter((a: any) =>
      new Date(a.created_at) >= startOfDay && a.event.includes("executed")
    ).length;

    setApprovals(actions.slice(0, 5));
    setToday(todayList.slice(0, 5));
    setOverdue(overdueList.slice(0, 5));
    setCaptures(merged);
    setFindings((sherlock.data ?? []).map((s: any) => {
      const f = s.findings || {};
      const flat = [...(f.risks || []), ...(f.contradictions || []), ...(f.blind_spots || [])];
      const top = flat[0];
      return {
        id: s.id, entity_type: s.entity_type,
        summary: typeof top === "string" ? top : (top?.text ?? top?.title ?? "Open finding"),
        confidence: s.confidence, updated_at: s.updated_at,
      };
    }));
    setReceipts((audit.data ?? []) as AuditRow[]);

    const pendingMap = new Map<string, SherlockFinding>();
    for (const f of (sherlockPending.data ?? []) as SherlockFinding[]) {
      if (f.source_object_id) pendingMap.set(f.source_object_id, f);
    }
    setPendingById(pendingMap);

    setCounts({
      pendingApprovals: actions.length,
      highRisk: actions.filter(a => a.risk === "high").length,
      openCommitments: allCommits.length,
      overdueCommitments: overdueList.length,
      sherlockFlags: (sherlock.data ?? []).length,
      recentCaptures: merged.length,
      executedToday: executedTodayCount,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pt-3 md:px-6">
        {/* Header — answers "where am I and what is this?" */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold text-foreground">Command Center</h1>
              <WhatIsThis topic="command_center" />
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Everything rolls up here. Situations first, statistics second.
            </p>
          </div>
        </div>

        {/* 1. Productivity Pulse — quick-health layer */}
        <ProductivityPulseCard />

        {/* 2. Aware bubble — sleeker, collapsed by default */}
        <AwareCockpitCard onOpenAwareness={() => onNavigate("awareness")} />

        {/* 3. Operations Briefing — plain-English situation report. */}
        <OperationsBriefingPanel onNavigate={onNavigate} />

        {/* 3a. Project / pinned-entity rollup — the per-project digest layer. */}
        <ProjectRollupCards />

        {/* 4. Live Capture — receipt roll. */}
        <div className="grid grid-cols-1 gap-3">
          <LiveCaptureCard items={captures} onOpen={() => onNavigate("memory")} findingsMap={pendingById} />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setBriefOpen(true)}
          >
            <FileText className="h-3 w-3" /> Create brief
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => openCanvas(null)}
          >
            <Network className="h-3 w-3" /> Open Canvas
          </Button>
        </div>

        {/* 5. Deep-dive tiles — demoted below the briefing.
            System receipts is owner-only (engine-room view). */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ApprovalsCard items={approvals} highRisk={counts.highRisk} onOpen={() => onNavigate("actions")} />
          <TodayCard today={today} overdue={overdue} onOpen={() => onNavigate("commitments")} />
          <FilesTile onOpen={() => onNavigate("memory")} />
          <SherlockWatchtowerCard items={findings} onOpen={() => onNavigate("sherlock")}
            onAnalyze={() => openSherlock({ entity_type: "freeform", title: "Cockpit scan", text: "" })} />
          <MemoryPulseCard onOpen={() => onNavigate("memory")} />
          {isOwner && (
            <SystemReceiptsCard items={receipts} onOpen={() => onNavigate("audit")} />
          )}
        </div>

        <ResearchPanel />

        {/* Past system-scope briefs */}
        <Card className="space-y-3 border-border/60 bg-surface-elevated/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3 w-3" /> Saved exports
              <WhatIsThis topic="saved_exports" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Every PDF you've exported, with receipts. Re-download any of them.</p>
          <BriefExportsList entityId={null} />
        </Card>

        <div className="text-center text-[11px] text-muted-foreground">
          Command Center is read-only. Approvals route into the existing Actions room. Capture lanes remain capture-only.
        </div>
      </div>

      <BriefComposerSheet
        open={briefOpen}
        onOpenChange={setBriefOpen}
        defaultScope="system"
      />
    </div>
  );
}

/* -------- header summary -------- */
function AmbientSummary({ counts }: { counts: Counts }) {
  const line = [
    `${counts.pendingApprovals} approval${counts.pendingApprovals === 1 ? "" : "s"} waiting`,
    counts.highRisk > 0 ? `${counts.highRisk} high-risk` : "no high-risk pending",
    `${counts.openCommitments} open commitment${counts.openCommitments === 1 ? "" : "s"}`,
    counts.overdueCommitments > 0 ? `${counts.overdueCommitments} overdue` : null,
    counts.sherlockFlags > 0 ? `${counts.sherlockFlags} Sherlock flag${counts.sherlockFlags === 1 ? "" : "s"}` : "no active flags",
  ].filter(Boolean).join(" · ");

  return (
    <Card className="border-border/60 bg-surface-elevated/60 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3 w-3" /> Operational summary
        </div>
        <div className="text-sm text-foreground/90">{line}.</div>
        <div className="text-[11px] text-muted-foreground">
          {counts.executedToday} action{counts.executedToday === 1 ? "" : "s"} executed today · {counts.recentCaptures} recent capture{counts.recentCaptures === 1 ? "" : "s"}
        </div>
      </div>
    </Card>
  );
}

/* -------- cards -------- */
function CardShell({ title, Icon, badge, onOpen, children, openLabel = "Open" }: {
  title: string; Icon: typeof CheckSquare; badge?: string | null;
  onOpen: () => void; children: React.ReactNode; openLabel?: string;
}) {
  return (
    <Card className="flex flex-col gap-3 border-border/60 bg-surface-elevated/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          {badge ? <Badge variant="secondary" className="ml-1 text-[10px]">{badge}</Badge> : null}
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={onOpen}>
          {openLabel} <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="text-[12px] text-muted-foreground">{children}</div>;
}

function ApprovalsCard({ items, highRisk, onOpen }: { items: ActionRow[]; highRisk: number; onOpen: () => void }) {
  return (
    <CardShell title="Approvals" Icon={ListChecks} badge={items.length ? String(items.length) : null}
      onOpen={onOpen} openLabel="Review">
      {items.length === 0 ? <Empty>No pending approvals.</Empty> : (
        <ul className="space-y-2">
          {items.map(a => {
            const I = RiskIcon[a.risk];
            return (
              <li key={a.id} className="flex items-start gap-2 text-[12.5px]">
                <I className={cn("mt-0.5 h-3.5 w-3.5", riskTone[a.risk])} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">{a.title}</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {a.risk.replace("_", " ")} · {a.status} · {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {highRisk > 0 && (
        <div className="mt-2 rounded border border-warn/30 bg-warn/5 px-2 py-1 text-[11px] text-warn">
          {highRisk} high-risk requires typed approval in the Actions room.
        </div>
      )}
    </CardShell>
  );
}

function TodayCard({ today, overdue, onOpen }: { today: CommitmentRow[]; overdue: CommitmentRow[]; onOpen: () => void }) {
  return (
    <CardShell title="Today" Icon={CheckSquare}
      badge={today.length || overdue.length ? `${today.length}+${overdue.length}` : null}
      onOpen={onOpen} openLabel="Open commitments">
      {today.length === 0 && overdue.length === 0 ? (
        <Empty>No commitments due today.</Empty>
      ) : (
        <ul className="space-y-2">
          {overdue.map(c => (
            <li key={c.id} className="text-[12.5px]">
              <div className="text-warn">⚠ {c.summary}</div>
              <div className="text-[10.5px] text-muted-foreground">
                overdue · {c.due_at ? formatDistanceToNow(new Date(c.due_at), { addSuffix: true }) : "no due date"}
              </div>
            </li>
          ))}
          {today.map(c => (
            <li key={c.id} className="text-[12.5px]">
              <div className="text-foreground">{c.summary}</div>
              <div className="text-[10.5px] text-muted-foreground">due today · {c.priority}</div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function LiveCaptureCard({ items, onOpen, findingsMap }: { items: CaptureRow[]; onOpen: () => void; findingsMap: Map<string, SherlockFinding> }) {
  const { openSherlock } = useSherlock();
  return (
    <CardShell title="Live Capture" Icon={Inbox}
      badge={items.length ? String(items.length) : null}
      onOpen={onOpen} openLabel="Open memory">
      {items.length === 0 ? <Empty>Nothing captured recently.</Empty> : (
        <ul className="space-y-2">
          {items.map(c => {
            const finding = findingsMap.get(c.id);
            return (
              <li key={c.id} className="text-[12.5px]">
                <div className="truncate text-foreground">{c.label}</div>
                <div className="text-[10.5px] text-muted-foreground">
                  {c.kind} · {c.source ?? "capture"} · {formatDistanceToNow(new Date(c.ts), { addSuffix: true })}
                </div>
                {finding && (
                  <SherlockHintChip
                    hint={{
                      id: finding.id,
                      mode: finding.mode,
                      summary: finding.summary,
                      confidence: finding.confidence,
                      suggested_action: finding.suggested_action,
                    }}
                    onOpen={() => {
                      openSherlock({
                        entity_type: c.kind === "message" ? "message" : c.kind === "file" ? "file" : "freeform",
                        entity_id: c.id,
                        title: finding.summary.slice(0, 80),
                        text: "",
                      });
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

function SherlockWatchtowerCard({ items, onOpen, onAnalyze }: {
  items: { id: string; entity_type: string; summary: string; confidence: string | null; updated_at: string }[];
  onOpen: () => void; onAnalyze: () => void;
}) {
  return (
    <CardShell title="Sherlock Watchtower" Icon={Search}
      badge={items.length ? String(items.length) : null} onOpen={onOpen} openLabel="Open Sherlock">
      {items.length === 0 ? (
        <div className="space-y-2">
          <Empty>No active flags.</Empty>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAnalyze}>
            <Sparkles className="h-3 w-3" /> Run an ad-hoc analysis
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map(s => (
            <li key={s.id} className="text-[12.5px]">
              <div className="text-foreground">{s.summary || "Open finding"}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {s.entity_type}{s.confidence ? ` · ${s.confidence} confidence` : ""} · {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function MemoryPulseCard({ onOpen }: { onOpen: () => void }) {
  const [recent, setRecent] = useState<{ id: string; title: string | null; created_at: string }[]>([]);
  useEffect(() => {
    supabase.from("notes").select("id, title, created_at").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecent((data ?? []) as any));
  }, []);
  return (
    <CardShell title="Memory Pulse" Icon={Notebook} onOpen={onOpen} openLabel="Open memory">
      {recent.length === 0 ? <Empty>No memory items yet.</Empty> : (
        <ul className="space-y-2">
          {recent.map(n => (
            <li key={n.id} className="text-[12.5px]">
              <div className="truncate text-foreground">{n.title || "Untitled note"}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function SystemReceiptsCard({ items, onOpen }: { items: AuditRow[]; onOpen: () => void }) {
  return (
    <CardShell title="System Receipts" Icon={ScrollText} onOpen={onOpen} openLabel="Open audit">
      {items.length === 0 ? <Empty>No recent receipts.</Empty> : (
        <ul className="space-y-2">
          {items.slice(0, 5).map(r => (
            <li key={r.id} className="text-[12.5px]">
              <div className="truncate text-foreground">{r.event}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {r.entity_type} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function FilesTile({ onOpen }: { onOpen: () => void }) {
  const [counts, setCounts] = useState<{ newToday: number; triage: number; lastName: string | null; lastWhen: string | null }>({
    newToday: 0, triage: 0, lastName: null, lastWhen: null,
  });
  useEffect(() => {
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const [today, triage, last] = await Promise.all([
        supabase.from("ingested_files").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
        supabase.from("ingested_files").select("id", { count: "exact", head: true }).in("review_status", ["new", "needs_review"]),
        supabase.from("ingested_files").select("filename, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setCounts({
        newToday: today.count ?? 0,
        triage: triage.count ?? 0,
        lastName: (last.data as any)?.filename ?? null,
        lastWhen: (last.data as any)?.created_at ?? null,
      });
    })();
  }, []);
  const badge = counts.triage > 0 ? `${counts.triage} to triage` : counts.newToday > 0 ? `${counts.newToday} today` : null;
  const isEmpty = counts.newToday === 0 && counts.triage === 0 && !counts.lastName;
  return (
    <CardShell title="Files" Icon={FileText} badge={badge} onOpen={onOpen} openLabel="Open files">
      {isEmpty ? (
        <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          No files yet. Drop a PDF, image, or note into the companion to capture it.
        </div>
      ) : (
        <>
          <ul className="space-y-1.5 text-[12.5px]">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">New today</span>
              <span className="text-foreground">{counts.newToday}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Awaiting triage</span>
              <span className={cn(counts.triage > 0 ? "text-warn" : "text-foreground")}>{counts.triage}</span>
            </li>
          </ul>
          {counts.lastName && counts.lastWhen && (
            <div className="mt-2 truncate text-[10.5px] text-muted-foreground">
              Last: {counts.lastName} · {formatDistanceToNow(new Date(counts.lastWhen), { addSuffix: true })}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}
