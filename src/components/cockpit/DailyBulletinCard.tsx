/**
 * DailyBulletinCard — Command Center "Since you last checked" surface.
 *
 * Slice 1 of the Daily Bulletin: derives a calm, plain-English summary of
 * what changed since the user last opened Command Center, using only data
 * that already exists (audit_log, brief_exports, project_items, projects,
 * intake_dismissals, user_channel_links, push_subscriptions,
 * email_inbound_addresses). No new tables, no new event engine, no AI calls.
 *
 * Last-seen tracking lives in localStorage to avoid a migration for this slice.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAuditEvent,
  composeSinceLastChecked,
  type BulletinBucket,
  type BulletinLine,
  type RawAuditEvent,
} from "@/lib/bulletinLanguage";

const LAST_SEEN_KEY = "vanta.command_center.last_seen_at";

type Source = {
  name: string;
  status: "connected" | "active" | "not_connected" | "later";
};

type Props = {
  /** Bumped by parent when it wants the bulletin to recompute. */
  refreshKey?: number;
};

export function DailyBulletinCard({ refreshKey = 0 }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BulletinLine[]>([]);
  const [exportsSaved, setExportsSaved] = useState(0);
  const [projectUpdates, setProjectUpdates] = useState<Record<string, number>>({});
  const [newCaptureCount, setNewCaptureCount] = useState(0);
  const [cleanupHidden, setCleanupHidden] = useState(0);
  const [cleanupGrouped, setCleanupGrouped] = useState(0);
  const [hasLastSeen, setHasLastSeen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [expanded, setExpanded] = useState<Record<BulletinBucket, boolean>>({
    attention: false,
    project: false,
    captures: false,
    done: false,
    cleanup: false,
  });

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, refreshKey]);

  async function load() {
    setLoading(true);
    const userId = session!.user.id;

    // Read last-seen first, then write "now" so this open shows the delta.
    const stored = readLastSeen();
    const sinceIso = stored ? new Date(stored).toISOString() : oneWeekAgoIso();
    writeLastSeen(new Date().toISOString());
    setHasLastSeen(!!stored);

    const [audit, exportsRes, itemsRes, dismissalsRes, channelsRes, emailRes, pushRes] =
      await Promise.all([
        supabase
          .from("audit_log")
          .select("id,event,entity_type,entity_id,created_at,payload")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(120),
        supabase
          .from("brief_exports")
          .select("id,title,project_id,created_at,status,scope_kind")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(20),
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
      const { data: projs } = await supabase
        .from("projects")
        .select("id,title")
        .in("id", Array.from(projectIds));
      for (const p of (projs ?? []) as Array<{ id: string; title: string }>)
        projectNames.set(p.id, p.title);
    }

    // Project updates rollup (by project name).
    const projCounts: Record<string, number> = {};
    for (const it of itemsRes.data ?? []) {
      const name = projectNames.get(it.project_id) ?? "A project";
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

    // New captures count from audit + project_items "capture" type.
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
    setLines(deduped);

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

  const summary = useMemo(
    () =>
      composeSinceLastChecked({
        hasLastSeen,
        projectUpdatesByName: projectUpdates,
        newCaptures: newCaptureCount,
        exportsSaved,
        needsAttention: lines.filter((l) => l.bucket === "attention").length,
        cleanupHidden,
        cleanupGrouped,
      }),
    [
      hasLastSeen,
      projectUpdates,
      newCaptureCount,
      exportsSaved,
      lines,
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
    for (const l of lines) map[l.bucket].push(l);
    return map;
  }, [lines]);

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
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Compass className="h-3 w-3" /> Daily bulletin
      </div>

      {/* Top summary */}
      <p className="mb-3 text-[13px] leading-relaxed text-foreground/90">{summary}</p>

      {/* Sections */}
      <Section
        bucket="attention"
        icon={AlertCircle}
        label="Needs attention"
        empty="No new project updates need review."
        items={byBucket.attention}
        expanded={expanded.attention}
        onToggle={() => setExpanded((s) => ({ ...s, attention: !s.attention }))}
      />
      <Section
        bucket="project"
        icon={Sparkles}
        label="Project updates"
        empty="No project changes since you last checked."
        items={byBucket.project}
        expanded={expanded.project}
        onToggle={() => setExpanded((s) => ({ ...s, project: !s.project }))}
      />
      <Section
        bucket="captures"
        icon={Inbox}
        label="New captures"
        empty="No new captures."
        items={byBucket.captures}
        expanded={expanded.captures}
        onToggle={() => setExpanded((s) => ({ ...s, captures: !s.captures }))}
      />
      <Section
        bucket="done"
        icon={CheckCircle2}
        label="Done and saved"
        empty="Nothing was completed or saved recently."
        items={byBucket.done}
        expanded={expanded.done}
        onToggle={() => setExpanded((s) => ({ ...s, done: !s.done }))}
      />
      <Section
        bucket="cleanup"
        icon={Sparkles}
        label="Quiet cleanup"
        empty="Cleanup is quiet."
        items={byBucket.cleanup}
        expanded={expanded.cleanup}
        onToggle={() => setExpanded((s) => ({ ...s, cleanup: !s.cleanup }))}
      />

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
  empty,
  items,
  expanded,
  onToggle,
}: {
  bucket: BulletinBucket;
  icon: any;
  label: string;
  empty: string;
  items: BulletinLine[];
  expanded: boolean;
  onToggle: () => void;
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
        <div className="text-[11.5px] text-muted-foreground">{empty}</div>
      ) : (
        <>
          <ul className="space-y-0.5">
            {visible.map((l) => (
              <li
                key={l.id}
                className="text-[12px] leading-snug text-foreground/85"
              >
                · {l.text}
              </li>
            ))}
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
