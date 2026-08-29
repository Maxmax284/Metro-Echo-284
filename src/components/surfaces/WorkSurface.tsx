import { useCallback, useEffect, useState } from "react";
import { useLongPress } from "@/hooks/useLongPress";
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
import { DESK_TILE_HINT, type DeskKey } from "@/lib/deskRoles";
import { DeskInfo } from "@/components/work/DeskInfo";
import { WorkBriefingPanel } from "@/components/work/WorkBriefing";
import { useWorkBriefing } from "@/hooks/useWorkBriefing";
import { useHandoffTrace } from "@/hooks/useHandoffTrace";




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
  const { briefing, loading: briefingLoading } = useWorkBriefing();
  const trace = useHandoffTrace();



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

        {/* The state of work comes before the directory of desks. */}
        {!briefingLoading && <WorkBriefingPanel briefing={briefing} onNavigate={onNavigate} />}

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
                        onClick={() => void trace({ step: `opened ${p.title}`, label: p.title, surface: "projects", projectId: p.id })}

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

        {/* Two shelves instead of ten equal choices: where work lands, and
            where Vanta looks. Presentation only — every route is unchanged. */}
        <section className="vanta-card p-3" aria-label="Where work lands">
          <SectionRail label="Where work lands" />
          <SectionNote sectionKey="work.lands">{sectionNote("work.lands")}</SectionNote>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Desk deskKey="projects" label="Projects" Icon={FolderKanban} onOpen={() => onNavigate("projects")} />
            <Desk deskKey="inbox" label="Inbox" Icon={Inbox} count={counts.inbox} onOpen={() => onNavigate("inbox")} />
            <Desk deskKey="commitments" label="Commitments" Icon={CheckSquare} count={counts.commitments} onOpen={() => onNavigate("commitments")} />
            <Desk deskKey="actions" label="Actions" Icon={ListChecks} count={counts.actions} onOpen={() => onNavigate("actions")} />
            <Desk deskKey="briefs" label="Briefs" Icon={FileText} onOpen={() => onNavigate("briefs")} />
            <Desk deskKey="documents" label="Documents" Icon={FileText} href="/documents" />
            <Desk deskKey="schedule" label="Schedule" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
          </div>
        </section>

        <section className="vanta-card border-dashed p-3 opacity-95" aria-label="Where Vanta looks">
          <SectionRail label="Where Vanta looks" />
          <SectionNote sectionKey="work.looks">{sectionNote("work.looks")}</SectionNote>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Desk deskKey="memory" label="Memory" Icon={Notebook} onOpen={() => onNavigate("memory")} />
            <Desk deskKey="sherlock" label="Sherlock" Icon={Search} onOpen={() => onNavigate("sherlock")} />
            <Desk deskKey="awareness" label="Awareness" Icon={Compass} onOpen={() => onNavigate("awareness")} />
            <Desk deskKey="command" label="Cockpit" Icon={LayoutDashboard} onOpen={() => onNavigate("command")} />
          </div>
        </section>


      </div>
    </div>
  );
}

function Desk({
  deskKey,
  label,
  Icon,
  count,
  onOpen,
  href,
}: {
  deskKey: DeskKey;
  label: string;
  Icon: typeof Inbox;
  count?: number;
  onOpen?: () => void;
  href?: string;
}) {
  /* Long press on touch reveals the desk's explanation. It never navigates and
     never executes — and the tap that ends the hold is swallowed so the tile
     does not also open the desk underneath the panel. */
  const [infoOpen, setInfoOpen] = useState(false);
  const longPress = useLongPress(() => setInfoOpen(true));

  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{DESK_TILE_HINT[deskKey]}</span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="shrink-0 rounded-[2px] bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <RollingNumber value={count} />
        </span>
      )}
    </>
  );
  const className = cn(
    "flex min-h-[44px] flex-1 items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
    /* A hold must not also select the label text on touch. */
    "select-none touch-manipulation",
    MOTION_ROW,
    MOTION_HOVER_LIFT,
    MOTION_FOCUS,
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      {href ? (
        <a
          href={href}
          className={className}
          aria-describedby={undefined}
          {...longPress.handlers}
          onClick={(e) => {
            if (longPress.shouldSuppressClick()) {
              e.preventDefault();
              return;
            }
            markFlipOriginFromEvent(e);
          }}
        >
          {body}
        </a>
      ) : (
        <button
          className={className}
          {...longPress.handlers}
          onClick={(e) => {
            if (longPress.shouldSuppressClick()) {
              e.preventDefault();
              return;
            }
            markFlipOriginFromEvent(e);
            onOpen?.();
          }}
        >
          {body}
        </button>
      )}
      <DeskInfo deskKey={deskKey} open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}
