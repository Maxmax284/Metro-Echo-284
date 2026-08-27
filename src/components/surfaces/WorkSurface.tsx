import { useCallback, useEffect, useState } from "react";
import {
  FolderKanban,
  Inbox,
  FileText,
  Notebook,
  CheckSquare,
  CalendarClock,
  ListChecks,
  Search,
  Compass,
  LayoutDashboard,
  ChevronRight,
  Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { listProjects, type Project } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { ResumeWorkSection } from "@/components/today/ResumeWorkSection";
import { WeekAgenda } from "@/components/work/WeekAgenda";
import { formatDistanceToNow } from "date-fns";
import { SectionNote } from "@/components/ui/section-note";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { sectionNote } from "@/lib/roomCopy";
import { cn } from "@/lib/utils";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { LEAD_BAR, MOTION_BOOT, MOTION_FOCUS, MOTION_HOVER_LIFT, MOTION_ROW } from "@/lib/motion";
import {
  MachineLabel,
  MachineText,
  RollingNumber,
  SectionRail,
  SyncStamp,
} from "@/components/ui/instrument";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  projectStatus,
  projectTimeLabel,
} from "@/lib/workLabels";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";


type Counts = { inbox: number; commitments: number; actions: number };

/**
 * Work — the operational room. It orients you and hands off to the specialist
 * desk that owns the record. It deliberately does not restate every row.
 */
export function WorkSurface({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { user } = useAuth();
  const { applyScope, scope, orgId, key } = useScope();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Counts>({ inbox: 0, commitments: 0, actions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* When Vanta last actually looked. Shown as a real stamp, never faked. */
  const [lastRead, setLastRead] = useState<number | null>(null);
  const { timezone } = useUserTimezone();

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [projs, notes, commits, actions] = await Promise.all([
        listProjects({ userId: user.id, organizationId: orgId ?? null }).catch(() => [] as Project[]),
        applyScope(supabase.from("notes").select("id", { count: "exact", head: true })),
        applyScope(supabase.from("commitments").select("id", { count: "exact", head: true })).eq("status", "open"),
        applyScope(supabase.from("actions").select("id", { count: "exact", head: true })).in("status", ["staged", "proposed"]),
      ]);
      setProjects((projs ?? []).slice(0, 4));
      setCounts({
        inbox: (notes as any)?.count ?? 0,
        commitments: (commits as any)?.count ?? 0,
        actions: (actions as any)?.count ?? 0,
      });
      setLastRead(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "Work could not load.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, orgId, scope]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-24 pt-3 md:px-4 md:pb-6">
      <div className={cn("mx-auto max-w-3xl space-y-3", MOTION_BOOT)}>
        <header className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <MachineLabel className="text-foreground/70">Work</MachineLabel>
          <span className="ml-auto flex items-center gap-2">
            <SyncStamp at={lastRead} timezone={timezone} />
            <ExplainThisButton room="work" />
          </span>
        </header>

        <ResumeWorkSection onNavigate={onNavigate} />

        <WeekAgenda onOpenSettings={() => { window.location.href = "/settings"; }} />


        {error ? (
          <ErrorState error={error} doing="pulling your work together" onRetry={refresh} />
        ) : loading ? (
          <LoadingState label="Pulling your work together…" />
        ) : (
          <section className="vanta-card p-3" aria-label="Recent projects">
            <SectionRail
              label="Recent projects"
              icon={<FolderKanban className="h-3.5 w-3.5" />}
              reading={projects.length > 0 ? <RollingNumber value={projects.length} /> : undefined}
              action={
                <button
                  onClick={() => onNavigate("projects")}
                  className={cn("min-h-[36px] text-xs text-primary hover:underline", MOTION_FOCUS)}
                >
                  All projects
                </button>
              }
            />
            <SectionNote sectionKey="work.projects">{sectionNote("work.projects")}</SectionNote>
            {projects.length === 0 ? (
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                No projects yet. Start one in the Projects desk and anything you capture can be attached to it.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {projects.map((p) => {
                  const st = projectStatus({
                    status: (p as { status?: string | null }).status ?? null,
                    updatedAt: p.updated_at,
                  });
                  return (
                    <li key={p.id}>
                      <a
                        href={`/projects/${p.id}`}
                        className={cn(
                          "flex min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
                          MOTION_ROW,
                          MOTION_HOVER_LIFT,
                          MOTION_FOCUS,
                          /* The leading rail carries the status colour, so the
                             row reads at a glance before you read a word. */
                          LEAD_BAR,
                          PROJECT_STATUS_TONE[st],
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">{p.title}</span>
                          <MachineText className="block truncate text-[10px] text-muted-foreground">
                            {projectTimeLabel({ updatedAt: p.updated_at })}
                          </MachineText>
                        </span>
                        <span className={cn("vanta-machine-label shrink-0", PROJECT_STATUS_TONE[st])}>
                          {PROJECT_STATUS_LABEL[st]}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Desks, grouped by how often you touch them. Presentation only —
            every destination is the same surface it always was. */}
        <section className="vanta-card p-3" aria-label="Desks">
          <SectionRail label="Desks" />
          <SectionNote sectionKey="work.desks">{sectionNote("work.desks")}</SectionNote>

          <div className="mt-3">
            <MachineLabel className="text-foreground/60">Daily work</MachineLabel>
            <SectionNote sectionKey="work.daily">{sectionNote("work.daily")}</SectionNote>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Desk label="Inbox" hint="What came in" Icon={Inbox} count={counts.inbox} onOpen={() => onNavigate("inbox")} />
              <Desk label="Commitments" hint="What you owe" Icon={CheckSquare} count={counts.commitments} onOpen={() => onNavigate("commitments")} />
              <Desk label="Actions" hint="Waiting on approval" Icon={ListChecks} count={counts.actions} onOpen={() => onNavigate("actions")} />
            </div>
          </div>

          <div className="mt-3 border-t border-border/40 pt-3">
            <MachineLabel className="text-foreground/60">Knowledge</MachineLabel>
            <SectionNote sectionKey="work.knowledge">{sectionNote("work.knowledge")}</SectionNote>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Desk label="Briefs" hint="Composed exports" Icon={FileText} onOpen={() => onNavigate("briefs")} />
              <Desk label="Documents" hint="Drafts & reviews" Icon={FileText} href="/documents" />
              <Desk label="Memory" hint="Search everything" Icon={Notebook} onOpen={() => onNavigate("memory")} />
            </div>
          </div>
        </section>

        {/* Deeper tools sit quieter on purpose: useful, not the main road. */}
        <section className="vanta-card border-dashed p-3 opacity-95" aria-label="Deeper tools">
          <SectionRail label="Deeper tools" />
          <SectionNote sectionKey="work.deeper">{sectionNote("work.deeper")}</SectionNote>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Desk label="Schedule" hint="Day view" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
            <Desk label="Sherlock" hint="Investigate" Icon={Search} onOpen={() => onNavigate("sherlock")} />
            <Desk label="Awareness" hint="Where you are" Icon={Compass} onOpen={() => onNavigate("awareness")} />
            <Desk label="Cockpit" hint="Advanced dense view" Icon={LayoutDashboard} onOpen={() => onNavigate("command")} />
          </div>
        </section>

      </div>
    </div>
  );
}

function Desk({
  label,
  hint,
  Icon,
  count,
  onOpen,
  href,
}: {
  label: string;
  hint: string;
  Icon: typeof Inbox;
  count?: number;
  onOpen?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="shrink-0 rounded-[2px] bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <RollingNumber value={count} />
        </span>
      )}
    </>
  );
  /* Work is the operational room: crisper corners, tighter rhythm, desks that
     read like machined panels rather than marketing cards. */
  const className = cn(
    "flex min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
    MOTION_ROW,
    MOTION_HOVER_LIFT,
    MOTION_FOCUS,
  );

  /* Matched travel: record the desk's rect on the way out so whatever opens
     next grows out of this row rather than fading in from nowhere. */
  return href ? (
    <a href={href} className={className} onClick={markFlipOriginFromEvent}>{body}</a>
  ) : (
    <button
      onClick={(e) => {
        markFlipOriginFromEvent(e);
        onOpen?.();
      }}
      className={className}
    >
      {body}
    </button>
  );
}
