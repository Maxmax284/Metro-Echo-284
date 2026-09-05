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
import { DESK_ROLES, DESK_TILE_HINT, DESK_VERB, type DeskKey } from "@/lib/deskRoles";
import { DeskInfo } from "@/components/work/DeskInfo";
import { DeskStartHere } from "@/components/work/DeskStartHere";
import { DeskQuickActions } from "@/components/work/DeskQuickActions";
import { WorkFlowDemo } from "@/components/work/WorkFlowDemo";
import { WorkBriefingPanel } from "@/components/work/WorkBriefing";
import { useWorkBriefing } from "@/hooks/useWorkBriefing";
import { useHandoffTrace } from "@/hooks/useHandoffTrace";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PlayCircle } from "lucide-react";
import { useSherlockPending } from "@/hooks/useSherlockPending";
import { GotSomethingChooser } from "@/components/intake/GotSomethingChooser";
import { PhysicalLoopPanel } from "@/components/work/PhysicalLoopPanel";
import { WorkBodyLine } from "@/components/work/WorkBodyLine";





type Counts = { inbox: number; commitments: number; actions: number };

/**
 * The next step worth taking at a desk, derived only from counts this room has
 * already loaded. Returns null rather than inventing a step.
 */
function recommendedStep(
  deskKey: DeskKey,
  counts: Counts,
  projectCount: number,
): string | null {
  switch (deskKey) {
    case "inbox":
      return counts.inbox > 0
        ? `Route the ${counts.inbox === 1 ? "one arrival" : `${counts.inbox} arrivals`} sitting unsorted.`
        : "Nothing to sort. Capture something and it lands here.";
    case "actions":
      return counts.actions > 0
        ? `Review the ${counts.actions === 1 ? "draft" : `${counts.actions} drafts`} waiting on your approval.`
        : "No drafts waiting. Nothing can run without your approval anyway.";
    case "commitments":
      return counts.commitments > 0
        ? `Check the ${counts.commitments === 1 ? "one open promise" : `${counts.commitments} open promises`} and close what is done.`
        : "No open promises. Record one when somebody is expecting something.";
    case "projects":
      return projectCount > 0
        ? "Open the job you touched last and see what is attached to it."
        : "Start your first project, then attach what you capture to it.";
    default:
      return null;
  }
}


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
  /* When Echo last actually looked. Shown as a real stamp, never faked. */
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

  /* Storyboard only. It writes nothing, so it can be replayed at any time. */
  const [demoOpen, setDemoOpen] = useState(false);
  const hasIntake = projects.length > 0 || counts.inbox > 0 || counts.commitments > 0;
  /* Read-only: a live finding forces the reading shelf open, so nothing real
     is ever hidden behind a fold. */
  const { items: findings } = useSherlockPending({ limit: 1 });
  const hasFindings = findings.length > 0;

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-24 pt-3 md:px-4 md:pb-6">
      <div className={cn("mx-auto max-w-3xl space-y-3", MOTION_BOOT)}>
        <header className="flex flex-wrap items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <MachineLabel className="text-foreground/70">Work</MachineLabel>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <GotSomethingChooser onFiled={() => void refresh()} />
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className={cn(
                "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
                "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground",
                MOTION_FOCUS,
              )}
            >
              <PlayCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              See how Work flows
            </button>
            <SyncStamp at={lastRead} timezone={timezone} />
            <ExplainThisButton room="work" />
          </span>
        </header>

        <WorkFlowDemo open={demoOpen} onOpenChange={setDemoOpen} />


        {/* Three tiers, always in the same order, always labelled: where
            things stand, where work lands, where Echo looks. The state of
            work comes before the directory of desks. */}
        <TierHeading
          n={1}
          title="Where things stand"
          line="Today's state of play — the briefing, what you left open, and the week ahead."
        />

        <WorkBodyLine />

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
            where Echo looks. Presentation only — every route is unchanged. */}
        <TierHeading
          n={2}
          title="Where work lands"
          line="The desks that hold your records. Everything you route, promise or approve ends up in one of these."
        />

        <section className="vanta-card p-3" aria-label="Where work lands">
          <SectionRail label="Desks" icon={<FolderKanban className="h-3.5 w-3.5" />} />
          <SectionNote sectionKey="work.lands">{sectionNote("work.lands")}</SectionNote>
          <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Desk deskKey="projects" label="Projects" Icon={FolderKanban} recommended={recommendedStep("projects", counts, projects.length)} onOpen={() => onNavigate("projects")} />
            <Desk deskKey="inbox" label="Inbox" Icon={Inbox} count={counts.inbox} recommended={recommendedStep("inbox", counts, projects.length)} onOpen={() => onNavigate("inbox")} />
            <Desk deskKey="commitments" label="Commitments" Icon={CheckSquare} count={counts.commitments} recommended={recommendedStep("commitments", counts, projects.length)} onOpen={() => onNavigate("commitments")} />
            <Desk deskKey="actions" label="Actions" Icon={ListChecks} count={counts.actions} recommended={recommendedStep("actions", counts, projects.length)} onOpen={() => onNavigate("actions")} />
            <Desk deskKey="briefs" label="Briefs" Icon={FileText} onOpen={() => onNavigate("briefs")} />
            <Desk deskKey="documents" label="Documents" Icon={FileText} href="/documents" />
            <Desk deskKey="schedule" label="Schedule" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
          </div>
        </section>

        {/* Reading rooms fold, but they stop hiding the moment intake starts:
            once anything has arrived, these desks have something to read, so
            the shelf opens itself unless you closed it yourself. The fold is a
            visible control with a count, never a mystery. */}
        <CollapsibleSection
          key={`${hasIntake ? "live" : "quiet"}-${hasFindings ? "findings" : "none"}`}
          title="Where Echo looks"
          storageKey="work.looks"
          icon={<Search className="h-3.5 w-3.5" />}
          reading="4"
          /* A real finding is never hidden. Otherwise the shelf stays folded
             until there is something for these rooms to read. */
          defaultOpen={hasFindings || hasIntake}
          summary={
            hasFindings
              ? "Where Echo looks · Sherlock has something for you"
              : hasIntake
                ? "Where Echo looks · 4 places Echo reads on your behalf"
                : "Where Echo looks · nothing needs your attention yet"
          }
          className="border-dashed"
        >
          <p className="text-[11px] leading-snug text-muted-foreground">
            These read what you already captured and draft suggestions. Nothing here acts on its own.
          </p>
          <SectionNote sectionKey="work.looks">{sectionNote("work.looks")}</SectionNote>
          <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Desk deskKey="memory" label="Memory" Icon={Notebook} onOpen={() => onNavigate("memory")} />
            <Desk deskKey="sherlock" label="Sherlock" Icon={Search} onOpen={() => onNavigate("sherlock")} />
            <Desk deskKey="awareness" label="Awareness" Icon={Compass} onOpen={() => onNavigate("awareness")} />
            <Desk deskKey="command" label="Cockpit" Icon={LayoutDashboard} onOpen={() => onNavigate("command")} />
          </div>
        </CollapsibleSection>

        {/* Paper and phone: the physical loop, proved from real records. */}
        <PhysicalLoopPanel />



        <SurfaceAftermath surface="work" />
      </div>
    </div>
  );
}

/** A tier label. Presentation only — it explains the three levels of Work. */
function TierHeading({ n, title, line }: { n: 1 | 2 | 3; title: string; line: string }) {
  return (
    <div className="flex items-start gap-2 px-1 pt-2">
      <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/40 text-[9px] font-mono text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-[12.5px] font-semibold leading-tight text-foreground">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{line}</p>
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
  recommended,
}: {
  deskKey: DeskKey;
  label: string;
  Icon: typeof Inbox;
  count?: number;
  onOpen?: () => void;
  href?: string;
  /** Truthful next step, derived from counts this room already loaded. */
  recommended?: string | null;
}) {
  /* Long press on touch reveals the desk's explanation. It never navigates and
     never executes — and the tap that ends the hold is swallowed so the tile
     does not also open the desk underneath the panel. */
  const [infoOpen, setInfoOpen] = useState(false);
  const longPress = useLongPress(() => setInfoOpen(true));

  const role = DESK_ROLES[deskKey];
  /* When a desk is countable and currently empty, the tile says why it is
     empty instead of showing a bare zero. Nothing here reads new data. */
  const isEmpty = typeof count === "number" && count === 0;

  /* Both shapes of tile open the same place, so the quick actions below can
     share one handler without knowing which shape it sits under. */
  const open = () => {
    if (href) {
      window.location.href = href;
      return;
    }
    onOpen?.();
  };

  const body = (
    <>
      <Icon className="mt-[2px] h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{label}</span>
        {/* Verb first: what you do here, before what it holds. */}
        <span className="block text-[11.5px] font-medium leading-snug text-foreground/90">
          {DESK_VERB[deskKey]}
        </span>
        {/* One hint, not four. "Use when" and the full job description live in
            the "?" panel and on the desk itself, so a tile stays a tile. */}
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {isEmpty ? role.emptyWhy : DESK_TILE_HINT[deskKey]}
        </span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="shrink-0 rounded-[2px] bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <RollingNumber value={count} />
        </span>
      )}
    </>
  );
  const className = cn(
    "flex min-h-[44px] w-full items-start gap-2 vanta-inset vanta-cut px-3 py-2 text-left hover:bg-surface-elevated/70",
    /* A hold must not also select the label text on touch. */
    "select-none touch-manipulation",
    MOTION_ROW,
    MOTION_HOVER_LIFT,
    MOTION_FOCUS,
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-start gap-1">
        {href ? (
          <a
            href={href}
            className={className}
            title={role.useWhen}
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
            title={role.useWhen}
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
        <div className="flex shrink-0 flex-col items-center">
          <DeskStartHere deskKey={deskKey} />
          <DeskInfo
            deskKey={deskKey}
            open={infoOpen}
            onOpenChange={setInfoOpen}
            recommended={recommended}
          />
        </div>
      </div>
      {/* Do this: verb-first taps that only open the desk. */}
      <DeskQuickActions deskKey={deskKey} count={count} onOpen={open} className="pl-1" />
    </div>
  );

}
