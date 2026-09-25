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
  
  ChevronRight,
  Briefcase,
  Plane,
  LayoutGrid,
  Wallet,
  LifeBuoy,
  HeartPulse, Watch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { listProjects, type Project } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { WeekAgenda } from "@/components/work/WeekAgenda";
import { formatDistanceToNow } from "date-fns";
import { SectionNote } from "@/components/ui/section-note";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { sectionNote } from "@/lib/roomCopy";
import { cn } from "@/lib/utils";
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
  PROJECT_STATUS_TONE,
  projectStatus,
  projectTimeLabel,
} from "@/lib/workLabels";
import { ProjectSticker } from "@/components/projects/ProjectSticker";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { DESK_TILE_HINT, DESK_VERB, type DeskKey } from "@/lib/deskRoles";
import { WorkBriefingPanel } from "@/components/work/WorkBriefing";
import { useWorkBriefing } from "@/hooks/useWorkBriefing";
import { useHandoffTrace } from "@/hooks/useHandoffTrace";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useSherlockPending } from "@/hooks/useSherlockPending";
import { GotSomethingChooser } from "@/components/intake/GotSomethingChooser";
import { WatchShelf } from "@/components/work/WatchShelf";
import { MailShelf } from "@/components/work/MailShelf";
import { DriveFindPanel } from "@/components/work/DriveFindPanel";





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
  const { briefing, loading: briefingLoading, refresh: refreshBriefing } = useWorkBriefing();
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
            <SyncStamp at={lastRead} timezone={timezone} />
            <ExplainThisButton room="work" />
          </span>
        </header>


        {!briefingLoading && <WorkBriefingPanel briefing={briefing} onNavigate={onNavigate} onChanged={refreshBriefing} />}

        {/* Three stable shelves instead of ten equal choices: what is coming
            in, what is in motion, and what Echo noticed. Presentation only —
            every route is unchanged. A shelf with nothing in it names itself
            in one quiet line rather than showing a wall of empty tiles. */}
        <ShelfHeading title="Coming in" line="What arrived and what is on the calendar." />
        <section className="space-y-2" aria-label="Coming in">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {counts.inbox > 0 ? (
              <Desk deskKey="inbox" label="Just arrived" Icon={Inbox} count={counts.inbox} recommended={recommendedStep("inbox", counts, projects.length)} onOpen={() => onNavigate("inbox")} />
            ) : null}
            <Desk deskKey="schedule" label="Schedule" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
            {counts.inbox === 0 ? (
              <QuietShelfLine line="Nothing new to sort." />
            ) : null}
          </div>
          <MailShelf />
          <WeekAgenda onOpenSettings={() => { window.location.href = "/settings"; }} />
        </section>

        <ShelfHeading title="In motion" line="Jobs, promises and anything waiting on your yes." />
        <section className="space-y-2" aria-label="In motion">
          <WatchShelf />
          {error ? (
            <ErrorState error={error} doing="pulling your work together" onRetry={refresh} />
          ) : loading ? (
            <LoadingState label="Pulling your work together…" />
          ) : projects.length > 0 ? (
            <div className="vanta-card p-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-medium">Projects in motion</h3>
                <button onClick={() => onNavigate("projects")} className="ml-auto min-h-[36px] text-xs text-primary hover:underline">All projects</button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {projects.map((p) => {
                  const st = projectStatus({ status: (p as { status?: string | null }).status ?? null, updatedAt: p.updated_at });
                  return <li key={p.id}><a href={`/projects/${p.id}`} onClick={() => void trace({ step: `opened ${p.title}`, label: p.title, surface: "projects", projectId: p.id })} className={cn("flex min-h-[44px] items-center gap-2 vanta-inset px-3 py-2", MOTION_ROW, MOTION_HOVER_LIFT, MOTION_FOCUS, LEAD_BAR, PROJECT_STATUS_TONE[st])}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{p.title}</span><MachineText className="block text-[10px] text-muted-foreground">{projectTimeLabel({ updatedAt: p.updated_at })}</MachineText></span>
                    {/* Vinyl, not a pill: the state gets slapped on the card. */}
                    <ProjectSticker project={{ id: p.id, status: (p as { status?: string | null }).status ?? null, updated_at: p.updated_at }} />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </a></li>;
                })}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {projects.length === 0 ? <Desk deskKey="projects" label="Start a project" Icon={FolderKanban} recommended={recommendedStep("projects", counts, projects.length)} onOpen={() => onNavigate("projects")} /> : null}
            {counts.actions > 0 ? (
              <Desk deskKey="actions" label="Waiting on you" Icon={ListChecks} count={counts.actions} recommended={recommendedStep("actions", counts, projects.length)} onOpen={() => onNavigate("actions")} />
            ) : null}
            {counts.commitments > 0 ? (
              <Desk deskKey="commitments" label="Promises" Icon={CheckSquare} count={counts.commitments} recommended={recommendedStep("commitments", counts, projects.length)} onOpen={() => onNavigate("commitments")} />
            ) : null}
            {counts.actions === 0 && counts.commitments === 0 ? (
              <QuietShelfLine line="Nothing waiting on you, nothing promised." />
            ) : null}
          </div>
          {/* Nothing filed yet still shows the board's own language, so the
              tags are recognisable the first time a real one lands. */}
          {!loading && !error && projects.length === 0 ? (
            <p className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
              <span>Every project here wears a tag:</span>
              <span className="die-sticker px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]" data-blank="true">Active</span>
              <span className="die-sticker px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]" data-blank="true">Quiet</span>
              <span className="die-sticker px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]" data-blank="true">Needs you</span>
              <span>— slapped on when you start one.</span>
            </p>
          ) : null}

        </section>

        {/* What Echo noticed. Real findings are never hidden; with nothing to
            read the shelf stays folded behind one visible control. */}
        <CollapsibleSection
          key={`${hasIntake ? "live" : "quiet"}-${hasFindings ? "findings" : "none"}`}
          title="Echo noticed"
          storageKey="work.looks"
          icon={<Search className="h-3.5 w-3.5" />}
          defaultOpen={hasFindings || hasIntake}
          summary={
            hasFindings
              ? "Echo noticed · something worth a look"
              : hasIntake
                ? "Echo noticed · reading what you captured"
                : "Echo noticed · nothing yet"
          }
          className="border-dashed"
        >
          <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {hasFindings ? <Desk deskKey="sherlock" label="What Echo noticed" Icon={Search} onOpen={() => onNavigate("sherlock")} /> : null}
            <Desk deskKey="awareness" label="Place and context" Icon={Compass} onOpen={() => onNavigate("awareness")} />
            <QuietShelfLine line="Need something older?" cta="Find it" onOpen={() => onNavigate("memory")} />
          </div>
          <div className="mt-2.5">
            <DriveFindPanel />
          </div>
        </CollapsibleSection>



        {/* More desks. Every route is unchanged; the front page just carries
            less. Documents lives here once, and inside each project. */}
        <CollapsibleSection
          title="More desks"
          storageKey="work.more"
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          defaultOpen={false}
          summary="More desks · documents, schedule, flights, money, body"
        >
          <div className="mt-2.5 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
            <JumpTile label="Documents" word="Documents" line="Read, review, draft" Icon={FileText} href="/documents" />
            <JumpTile label="Schedule" word="Schedule" line="Day, upcoming, week" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
            <JumpTile label="Agenda board" word="Agenda" line="The whole day on one board" Icon={LayoutGrid} href="/?surface=schedule&tab=board" />
            <JumpTile label="Flights" word="Flights" line="Filed flights and journeys" Icon={Plane} href="/flights" />
            <JumpTile label="Money" word="Money" line="Balances, read-only" Icon={Wallet} href="/?surface=schedule&tab=money" />
            <JumpTile label="Body" word="Body" line="Readings, patterns, medication" Icon={HeartPulse} href="/?surface=schedule&tab=body" />
            <JumpTile label="Wearables" word="Wearables" line="Link a watch, band or ring" Icon={Watch} href="/how/watch" />
            <JumpTile label="Local help" word="Local help" line="Care and emergency numbers" Icon={LifeBuoy} href="/?surface=schedule&tab=help" />
          </div>
        </CollapsibleSection>

        <SurfaceAftermath surface="work" />
      </div>
    </div>
  );
}

/**
 * One tap to a place you already know you want. Presentation only — every
 * destination is an existing route, nothing new is read or written here.
 */
function JumpTile({
  label,
  word,
  line,
  Icon,
  href,
  onOpen,
}: {
  label: string;
  /** Short destination word for the transfer drum. Defaults to the label. */
  word?: string;
  line: string;
  Icon: typeof Inbox;
  href?: string;
  onOpen?: () => void;
}) {
  const navigate = useNavigate();
  const className = cn(
    "flex min-h-[60px] w-full flex-col justify-center gap-0.5 vanta-inset vanta-cut px-3 py-2 text-left touch-manipulation hover:bg-surface-elevated/70",
    MOTION_ROW,
    MOTION_HOVER_LIFT,
    MOTION_FOCUS,
  );
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-[12.5px] font-semibold text-foreground">{label}</span>
      </span>
      <span className="block text-[11px] leading-snug text-muted-foreground">{line}</span>
    </>
  );
  /* Every desk is reached inside the running app. The cover goes up first so
     the gap while the desk builds itself reads as a transfer, not a blackout. */
  const open = () => {
    beginDeskTransit({ word: word ?? label, line });
    if (!href) {
      onOpen?.();
      return;
    }
    const url = new URL(href, window.location.origin);
    const surface = url.searchParams.get("surface");
    const tab = url.searchParams.get("tab");
    if (url.pathname === "/" && surface === "schedule") {
      if (tab) requestScheduleTab(tab);
      onOpen?.();
      window.setTimeout(() => {
        if (tab) requestScheduleTab(tab);
      }, 0);
      return;
    }
    navigate(url.pathname + url.search);
  };

  return (
    <button type="button" onClick={open} className={className}>{body}</button>
  );
}

/** A shelf label. Typography carries the hierarchy — no numbered tour. */
function ShelfHeading({ title, line }: { title: string; line?: string }) {
  return (
    <div className="min-w-0 px-1 pt-2">
      <h2 className="text-[13px] font-semibold leading-tight text-foreground">{title}</h2>
      {line ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{line}</p>
      ) : null}
    </div>
  );
}

/**
 * What an empty shelf says. One quiet line and one way in — never a grid of
 * zeroed tiles competing with the shelf that actually has work in it.
 */
function QuietShelfLine({ line, cta, onOpen }: { line: string; cta?: string; onOpen?: () => void }) {
  return (
    <p className="min-[420px]:col-span-2 px-1 text-[11.5px] leading-snug text-muted-foreground">
      {line}{" "}
      {cta && onOpen ? <button
        type="button"
        onClick={onOpen}
        className={cn("text-primary hover:underline", MOTION_FOCUS)}
      >
        {cta}
      </button> : null}
    </p>
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
          {DESK_TILE_HINT[deskKey]}
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
    "touch-manipulation",
    MOTION_ROW,
    MOTION_HOVER_LIFT,
    MOTION_FOCUS,
  );

  return (
    <div className="min-w-0">
        {href ? (
          <a
            href={href}
            className={className}
            onClick={() => undefined}
          >
            {body}
          </a>
        ) : (
          <button
            className={className}
            onClick={onOpen}
          >
            {body}
          </button>
        )}
    </div>
  );

}
