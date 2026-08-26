/**
 * DailyBulletinCard — Command Center "Since you last checked" surface.
 *
 * Slice 2 layers inline actions, empty-state rules, capture grouping,
 * "Mark all seen", and a trust strip on top of the Slice 1 summary.
 * No new tables, no new AI calls. Actions write audit_log rows and use
 * existing tables: commitments, intake_dismissals.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  CheckCircle2,
  Inbox,
  AlertCircle,
  Sparkles,
  Plug,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast } from "@/lib/vantaVoice";
import {
  formatAuditEvent,
  composeSinceLastChecked,
  type BulletinBucket,
  type BulletinLine,
  type RawAuditEvent,
} from "@/lib/bulletinLanguage";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

const LAST_SEEN_KEY = "vanta.command_center.last_seen_at";

type Source = {
  name: string;
  status: "connected" | "active" | "not_connected" | "later";
};

type LineAction = {
  label: string;
  busy?: boolean;
  tone?: "default" | "muted" | "danger";
  onClick: () => void | Promise<void>;
};

type Props = {
  /** Bumped by parent when it wants the bulletin to recompute. */
  refreshKey?: number;
  /** Surface navigation hook (Command Center provides it). */
  onNavigate?: (k: SurfaceKey) => void;
};

export function DailyBulletinCard({ refreshKey = 0, onNavigate }: Props) {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BulletinLine[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportsSaved, setExportsSaved] = useState(0);
  const [projectUpdates, setProjectUpdates] = useState<Record<string, number>>({});
  const [newCaptureCount, setNewCaptureCount] = useState(0);
  const [cleanupHidden, setCleanupHidden] = useState(0);
  const [cleanupGrouped, setCleanupGrouped] = useState(0);
  const [hasLastSeen, setHasLastSeen] = useState(false);
  const [lastSeenIso, setLastSeenIso] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [auditRowCount, setAuditRowCount] = useState(0);
  const [exportsRowCount, setExportsRowCount] = useState(0);
  const [expanded, setExpanded] = useState<Record<BulletinBucket, boolean>>({
    attention: true, // open by default when items exist; harmless when empty
    project: false,
    captures: false,
    done: false,
    cleanup: false,
  });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, refreshKey, reloadTick, scopeKey]);

  async function load() {
    setLoading(true);
    const userId = session!.user.id;

    const stored = readLastSeen();
    const sinceIso = stored ? new Date(stored).toISOString() : oneWeekAgoIso();
    setHasLastSeen(!!stored);
    setLastSeenIso(stored);

    const [audit, exportsRes, itemsRes, dismissalsRes, channelsRes, emailRes, pushRes] =
      await Promise.all([
        applyScope(supabase
          .from("audit_log")
          .select("id,event,entity_type,entity_id,created_at,payload")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(120)),
        applyScope(supabase
          .from("brief_exports")
          .select("id,title,project_id,created_at,status,scope_kind")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(20)),
        supabase
          .from("project_items")
          .select("id,project_id,added_at,item_type")
          .gte("added_at", sinceIso)
          .order("added_at", { ascending: false })
          .limit(200),
        supabase
          .from("intake_dismissals")
          .select("id,dismissed_at,reason")
          .eq("user_id", userId)
          .is("restored_at", null)
          .gte("dismissed_at", sinceIso)
          .limit(100),
        supabase
          .from("user_channel_links")
          .select("channel,status")
          .eq("user_id", userId),
        supabase
          .from("email_inbound_addresses")
          .select("id,active")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", userId)
          .limit(1),
      ]);

    setAuditRowCount((audit.data ?? []).length);
    setExportsRowCount((exportsRes.data ?? []).length);

    // Resolve project names for any project_id appearing in items or exports.
    const projectIds = new Set<string>();
    for (const it of itemsRes.data ?? []) {
      if (it.project_id) projectIds.add(it.project_id);
    }
    for (const ex of exportsRes.data ?? []) {
      if (ex.project_id) projectIds.add(ex.project_id);
    }
    const projectNames = new Map<string, string>();
    if (projectIds.size > 0) {
      const { data: projs } = await applyScope(supabase
        .from("projects")
        .select("id,title")
        .in("id", Array.from(projectIds)));
      for (const p of (projs ?? []) as Array<{ id: string; title: string }>)
        projectNames.set(p.id, p.title);
    }

    // Project updates rollup (by project name).
    const projCounts: Record<string, number> = {};
    for (const it of itemsRes.data ?? []) {
      // project_items has no organization_id; the scoped projects lookup above is
      // the room filter. Unknown project = another room, so it is skipped.
      const name = projectNames.get(it.project_id);
      if (!name) continue;
      projCounts[name] = (projCounts[name] ?? 0) + 1;
    }
    setProjectUpdates(projCounts);

    // Translate audit events to plain English.
    const formatted: BulletinLine[] = [];
    for (const ev of (audit.data ?? []) as RawAuditEvent[]) {
      const projName =
        ev.entity_type === "project" && ev.entity_id
          ? projectNames.get(ev.entity_id)
          : undefined;
      const line = formatAuditEvent(ev, projName);
      if (line) formatted.push(line);
    }

    // Project updates also surface as bulletin lines, grouped per project.
    for (const [name, n] of Object.entries(projCounts)) {
      if (n <= 0) continue;
      formatted.unshift({
        id: `proj:${name}`,
        bucket: "project",
        text: n === 1 ? `Added 1 item to ${name}.` : `${name} had ${n} updates.`,
        at: new Date().toISOString(),
      });
    }

    // Export lines (in addition to audit, in case audit row was missed).
    let exportsCount = 0;
    for (const ex of exportsRes.data ?? []) {
      if (ex.status !== "exported" && ex.status !== "approved") continue;
      exportsCount += 1;
      const projName = ex.project_id ? projectNames.get(ex.project_id) : null;
      const text = projName
        ? `${projName} brief was exported and saved.`
        : `${ex.title || "A brief"} was exported and saved.`;
      formatted.push({
        id: `export:${ex.id}`,
        bucket: "done",
        text,
        at: ex.created_at,
        entity_type: "brief_export",
        entity_id: ex.id,
      });
    }
    setExportsSaved(exportsCount);

    // Cleanup counts: dismissals + grouped-captures audit events.
    const dismissals = (dismissalsRes.data ?? []).length;
    setCleanupHidden(dismissals);
    const grouped = (audit.data ?? []).filter(
      (a: any) =>
        a.event === "similar_captures.grouped" ||
        (a.payload && a.payload.group === true),
    ).length;
    setCleanupGrouped(grouped);

    const captureLikeEvents = (audit.data ?? []).filter((a: any) =>
      [
        "telegram.message_in",
        "ecosystem.gth.captured",
        "file.uploaded",
        "file.staged",
        "ingest.success",
      ].includes(a.event),
    ).length;
    setNewCaptureCount(captureLikeEvents);

    // Dedupe + cap.
    const seen = new Set<string>();
    const deduped: BulletinLine[] = [];
    for (const l of formatted) {
      const key = `${l.bucket}::${l.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(l);
    }

    // Capture grouping: 3+ captures with the same text collapse into one line.
    const captureGroups = new Map<string, BulletinLine[]>();
    const nonCapture: BulletinLine[] = [];
    for (const l of deduped) {
      if (l.bucket === "captures") {
        const arr = captureGroups.get(l.text) ?? [];
        arr.push(l);
        captureGroups.set(l.text, arr);
      } else {
        nonCapture.push(l);
      }
    }
    const grouppedCaptures: BulletinLine[] = [];
    for (const [text, arr] of captureGroups) {
      if (arr.length >= 3) {
        grouppedCaptures.push({
          id: `grp:${arr[0].id}`,
          bucket: "captures",
          text: `${arr.length} similar captures · ${text}`,
          at: arr[0].at,
          entity_type: "capture_group",
          payload: { group_ids: arr.map((a) => a.id) },
        });
      } else {
        grouppedCaptures.push(...arr);
      }
    }
    setLines([...nonCapture, ...grouppedCaptures]);

    // Connected sources strip.
    const tg = (channelsRes.data ?? []).find(
      (c: any) => c.channel === "telegram" && c.status === "active",
    );
    const wa = (channelsRes.data ?? []).find((c: any) => c.channel === "whatsapp");
    const srcs: Source[] = [
      { name: "Telegram", status: tg ? "connected" : "not_connected" },
      {
        name: "Email forwarding",
        status:
          emailRes.data && (emailRes.data as any).active ? "connected" : "not_connected",
      },
      { name: "File uploads", status: "active" },
      {
        name: "Push notifications",
        status: (pushRes.data ?? []).length > 0 ? "connected" : "not_connected",
      },
      { name: "Calendar", status: "not_connected" },
      { name: "WhatsApp", status: wa ? "connected" : "later" },
    ];
    setSources(srcs);

    setLoading(false);
  }

  // -- Action handlers (write to existing tables + audit_log) ---------------

  async function hideLine(id: string) {
    setHiddenIds((s) => new Set(s).add(id));
  }

  async function writeAudit(event: string, payload: Record<string, any>, entity_type?: string, entity_id?: string | null) {
    if (!session) return;
    await supabase.from("audit_log").insert({
      user_id: session.user.id,
      entity_type: entity_type ?? "bulletin",
      entity_id: entity_id ?? null,
      event,
      payload: { ...payload, at: new Date().toISOString(), surface: "command_center.bulletin" },
    });
  }

  async function markCommitmentDone(line: BulletinLine) {
    if (!line.entity_id) return;
    setBusyId(line.id);
    const { error } = await supabase
      .from("commitments")
      .update({ status: "done" })
      .eq("id", line.entity_id);
    if (error) {
      vantaToast.fromError(error);
      setBusyId(null);
      return;
    }
    await writeAudit("commitment.completed", { via: "bulletin" }, "commitment", line.entity_id);
    vantaToast.success({ title: "Marked done." });
    hideLine(line.id);
    setBusyId(null);
  }

  async function snoozeCommitmentOneDay(line: BulletinLine) {
    if (!line.entity_id) return;
    setBusyId(line.id);
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    const iso = target.toISOString();
    const { error } = await supabase
      .from("commitments")
      .update({ due_at: iso, remind_at: iso })
      .eq("id", line.entity_id);
    if (error) {
      vantaToast.fromError(error);
      setBusyId(null);
      return;
    }
    await writeAudit("commitment.snoozed", { preset: "1 day", to: iso }, "commitment", line.entity_id);
    vantaToast.success({ title: "Snoozed 1 day." });
    hideLine(line.id);
    setBusyId(null);
  }

  async function dismissAttention(line: BulletinLine) {
    setBusyId(line.id);
    await writeAudit(
      "bulletin.dismissed",
      { bucket: line.bucket, source_event: line.source_event, text: line.text },
      line.entity_type ?? "bulletin",
      line.entity_id,
    );
    hideLine(line.id);
    setBusyId(null);
  }

  async function dismissCapture(line: BulletinLine) {
    if (!session) return;
    setBusyId(line.id);
    // For grouped captures we just record a bulletin-level dismissal; the
    // underlying items remain in their own surfaces.
    const ids: string[] = line.payload?.group_ids ?? (line.entity_id ? [line.entity_id] : []);
    for (const id of ids) {
      await supabase.from("intake_dismissals" as any).insert({
        user_id: session.user.id,
        item_kind: "audit",
        item_id: id,
        reason: "bulletin",
        payload: { from: "command_center.bulletin", text: line.text },
      } as any);
    }
    await writeAudit("bulletin.dismissed", { bucket: "captures", count: ids.length, text: line.text });
    hideLine(line.id);
    setBusyId(null);
  }

  async function undoDismissal(line: BulletinLine) {
    if (!session) return;
    setBusyId(line.id);
    const itemId: string | undefined = line.payload?.item_id;
    const kind: string | undefined = line.payload?.kind;
    if (itemId && kind) {
      await supabase
        .from("intake_dismissals" as any)
        .update({ restored_at: new Date().toISOString() } as any)
        .eq("user_id", session.user.id)
        .eq("item_kind", kind)
        .eq("item_id", itemId)
        .is("restored_at", null);
      await writeAudit("intake.restored", { kind, item_id: itemId, via: "bulletin" }, kind, itemId);
      vantaToast.success({ title: "Restored." });
    } else {
      await writeAudit("bulletin.undo", { source_event: line.source_event });
      vantaToast.success({ title: "Undone." });
    }
    hideLine(line.id);
    setBusyId(null);
  }

  function navigateTo(k: SurfaceKey) {
    onNavigate?.(k);
  }

  async function markAllSeen() {
    writeLastSeen(new Date().toISOString());
    setHiddenIds(new Set());
    await writeAudit("bulletin.marked_all_seen", {});
    setReloadTick((t) => t + 1);
  }

  function actionsFor(line: BulletinLine): LineAction[] {
    const busy = busyId === line.id;
    switch (line.bucket) {
      case "attention": {
        if (line.entity_type === "commitment" && line.entity_id) {
          return [
            { label: busy ? "…" : "Mark done", busy, onClick: () => markCommitmentDone(line) },
            { label: "Snooze 1 day", tone: "muted", busy, onClick: () => snoozeCommitmentOneDay(line) },
          ];
        }
        return [
          { label: "Open", onClick: () => navigateTo(line.source_event?.startsWith("sherlock") ? "sherlock" : "inbox" as SurfaceKey) },
          { label: "Dismiss", tone: "muted", busy, onClick: () => dismissAttention(line) },
        ];
      }
      case "captures":
        return [
          { label: "Attach", onClick: () => navigateTo("memory") },
          { label: "Dismiss", tone: "muted", busy, onClick: () => dismissCapture(line) },
        ];
      case "done":
        return [{ label: "Open receipt", tone: "muted", onClick: () => navigateTo("receipts" as SurfaceKey) }];
      case "project":
        return [{ label: "Open", onClick: () => navigateTo("memory") }];
      case "cleanup":
        return [{ label: "Undo", tone: "muted", busy, onClick: () => undoDismissal(line) }];
      default:
        return [];
    }
  }

  // -- Derived state --------------------------------------------------------

  const visibleLines = useMemo(
    () => lines.filter((l) => !hiddenIds.has(l.id)),
    [lines, hiddenIds],
  );

  const summary = useMemo(
    () =>
      composeSinceLastChecked({
        hasLastSeen,
        projectUpdatesByName: projectUpdates,
        newCaptures: newCaptureCount,
        exportsSaved,
        needsAttention: visibleLines.filter((l) => l.bucket === "attention").length,
        cleanupHidden,
        cleanupGrouped,
      }),
    [
      hasLastSeen,
      projectUpdates,
      newCaptureCount,
      exportsSaved,
      visibleLines,
      cleanupHidden,
      cleanupGrouped,
    ],
  );

  const byBucket = useMemo(() => {
    const map: Record<BulletinBucket, BulletinLine[]> = {
      attention: [],
      project: [],
      captures: [],
      done: [],
      cleanup: [],
    };
    for (const l of visibleLines) map[l.bucket].push(l);
    return map;
  }, [visibleLines]);

  const trustStrip = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${auditRowCount} audit ${auditRowCount === 1 ? "event" : "events"}`);
    parts.push(`${exportsRowCount} export ${exportsRowCount === 1 ? "record" : "records"}`);
    parts.push(`${Object.values(projectUpdates).reduce((a, b) => a + b, 0)} project updates`);
    return `Reading ${parts.join(" · ")}. No AI was called for this view.`;
  }, [auditRowCount, exportsRowCount, projectUpdates]);

  if (loading) {
    return (
      <Card className="border-border/60 bg-surface-elevated/40 p-4">
        <div className="text-[12px] text-muted-foreground">Reading your day…</div>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-surface-elevated/40 p-4">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3 w-3" /> Daily bulletin
          <span className="normal-case tracking-normal text-muted-foreground/80 motion-breath">
            · {humanLastSeen(lastSeenIso)}
          </span>
        </div>
        <button
          onClick={markAllSeen}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Reset 'since you last checked'"
        >
          <Check className="h-3 w-3" /> Mark all seen
        </button>
      </div>

      {/* Top summary */}
      <p className="mb-1 text-[13px] leading-relaxed text-foreground/90">{summary}</p>

      {/* Trust strip — proves the bulletin is grounded in real data. */}
      <p className="mb-3 text-[10.5px] leading-snug text-muted-foreground/80">{trustStrip}</p>

      {/* Needs attention — always rendered, even when empty. */}
      <Section
        bucket="attention"
        icon={AlertCircle}
        label="Needs attention"
        emptyAlways="Nothing needs you right now."
        items={byBucket.attention}
        expanded={expanded.attention}
        onToggle={() => setExpanded((s) => ({ ...s, attention: !s.attention }))}
        actionsFor={actionsFor}
      />
      {/* Other sections — vanish entirely when empty. */}
      {byBucket.project.length > 0 && (
        <Section
          bucket="project"
          icon={Sparkles}
          label="Project updates"
          items={byBucket.project}
          expanded={expanded.project}
          onToggle={() => setExpanded((s) => ({ ...s, project: !s.project }))}
          actionsFor={actionsFor}
        />
      )}
      {byBucket.captures.length > 0 && (
        <Section
          bucket="captures"
          icon={Inbox}
          label="New captures"
          items={byBucket.captures}
          expanded={expanded.captures}
          onToggle={() => setExpanded((s) => ({ ...s, captures: !s.captures }))}
          actionsFor={actionsFor}
        />
      )}
      {byBucket.done.length > 0 && (
        <Section
          bucket="done"
          icon={CheckCircle2}
          label="Done and saved"
          items={byBucket.done}
          expanded={expanded.done}
          onToggle={() => setExpanded((s) => ({ ...s, done: !s.done }))}
          actionsFor={actionsFor}
        />
      )}
      {byBucket.cleanup.length > 0 && (
        <Section
          bucket="cleanup"
          icon={Sparkles}
          label="Quiet cleanup"
          items={byBucket.cleanup}
          expanded={expanded.cleanup}
          onToggle={() => setExpanded((s) => ({ ...s, cleanup: !s.cleanup }))}
          actionsFor={actionsFor}
        />
      )}

      {/* Connected sources strip */}
      <div className="mt-3 border-t border-border/40 pt-3">
        <div className="mb-1.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <Plug className="h-3 w-3" /> Connected sources
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <span
              key={s.name}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                s.status === "connected" || s.status === "active"
                  ? "border-primary/30 bg-primary/10 text-foreground"
                  : s.status === "later"
                    ? "border-border/50 bg-background/40 text-muted-foreground"
                    : "border-border/40 bg-background/30 text-muted-foreground",
              )}
            >
              {s.name}
              {s.status === "connected" ? " · connected" : null}
              {s.status === "active" ? " · active" : null}
              {s.status === "not_connected" ? " · not connected" : null}
              {s.status === "later" ? " · planned later" : null}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Section({
  bucket,
  icon: Icon,
  label,
  emptyAlways,
  items,
  expanded,
  onToggle,
  actionsFor,
}: {
  bucket: BulletinBucket;
  icon: any;
  label: string;
  /** When set, this empty-state copy is always rendered (e.g. Needs attention). */
  emptyAlways?: string;
  items: BulletinLine[];
  expanded: boolean;
  onToggle: () => void;
  actionsFor: (line: BulletinLine) => LineAction[];
}) {
  const LIMIT = 5;
  const visible = expanded ? items : items.slice(0, LIMIT);
  const hasMore = items.length > LIMIT;

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/80">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span>{label}</span>
        {items.length > 0 && (
          <span className="text-[10.5px] text-muted-foreground">· {items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        emptyAlways ? (
          <div className="text-[11.5px] text-muted-foreground">{emptyAlways}</div>
        ) : null
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((l) => {
              const actions = actionsFor(l).slice(0, 2);
              return (
                <li key={l.id} className="flex flex-col gap-1 text-[12px] leading-snug text-foreground/85">
                  <span>· {l.text}</span>
                  {actions.length > 0 && (
                    <div className="ml-2 flex flex-wrap gap-1.5">
                      {actions.map((a, i) => (
                        <button
                          key={i}
                          onClick={() => void a.onClick()}
                          disabled={a.busy}
                          className={cn(
                            "inline-flex min-h-[28px] items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition",
                            a.tone === "danger"
                              ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                              : a.tone === "muted"
                                ? "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                                : "border-primary/40 text-foreground hover:bg-primary/10",
                            a.busy && "opacity-60",
                          )}
                        >
                          {a.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-6 gap-1 px-1 text-[10.5px] text-muted-foreground hover:text-foreground"
              onClick={onToggle}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> View all ({items.length})
                </>
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(iso: string) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch {
    /* ignore */
  }
}

function oneWeekAgoIso(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

function humanLastSeen(iso: string | null): string {
  if (!iso) return "first visit";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `last checked ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `last checked ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `last checked ${days}d ago`;
}
