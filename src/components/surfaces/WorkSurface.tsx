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
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
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
      <div className="mx-auto max-w-3xl space-y-3">
        <header className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Work</h1>
          <span className="ml-auto text-[11px] text-muted-foreground">Everything you're working on</span>
        </header>

        <ResumeWorkSection onNavigate={onNavigate} />

        {error ? (
          <ErrorState detail={error} onRetry={refresh} />
        ) : loading ? (
          <LoadingState label="Pulling your work together…" />
        ) : (
          <section className="vanta-card p-3" aria-label="Recent projects">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Recent projects</h2>
              <button
                onClick={() => onNavigate("projects")}
                className="ml-auto min-h-[36px] text-xs text-primary hover:underline"
              >
                All projects
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No projects yet. Start one in the Projects desk and anything you capture can be attached to it.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
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
                          "flex min-h-[44px] items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated/40 px-3 py-2 text-left hover:border-primary/40",
                          MOTION_ROW,
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{p.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {projectTimeLabel({ updatedAt: p.updated_at })}
                          </span>
                        </span>
                        <span className={cn("shrink-0 text-[11px] font-medium", PROJECT_STATUS_TONE[st])}>
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

        <section className="vanta-card p-3" aria-label="Desks">
          <h2 className="text-sm font-semibold">Desks</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Each desk owns its own records. Open one when you want to work inside it.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Desk label="Inbox" hint="What came in" Icon={Inbox} count={counts.inbox} onOpen={() => onNavigate("inbox")} />
            <Desk label="Commitments" hint="What you owe" Icon={CheckSquare} count={counts.commitments} onOpen={() => onNavigate("commitments")} />
            <Desk label="Actions" hint="Waiting on approval" Icon={ListChecks} count={counts.actions} onOpen={() => onNavigate("actions")} />
            <Desk label="Briefs" hint="Composed exports" Icon={FileText} onOpen={() => onNavigate("briefs")} />
            <Desk label="Documents" hint="Drafts & reviews" Icon={FileText} href="/documents" />
            <Desk label="Memory" hint="Search everything" Icon={Notebook} onOpen={() => onNavigate("memory")} />
          </div>
        </section>

        <section className="vanta-card p-3" aria-label="Deeper tools">
          <h2 className="text-sm font-semibold">Deeper tools</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Desk label="Schedule" hint="Day view" Icon={CalendarClock} onOpen={() => onNavigate("schedule")} />
            <Desk label="Sherlock" hint="Investigate" Icon={Search} onOpen={() => onNavigate("sherlock")} />
            <Desk label="Awareness" hint="Where you are" Icon={Compass} onOpen={() => onNavigate("awareness")} />
            <Desk label="Cockpit" hint="Dense operations view" Icon={LayoutDashboard} onOpen={() => onNavigate("command")} />
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
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{count}</span>
      )}
    </>
  );
  const className = cn(
    "flex min-h-[44px] items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2 text-left transition-colors hover:border-primary/40",
  );
  return href ? (
    <a href={href} className={className}>{body}</a>
  ) : (
    <button onClick={onOpen} className={className}>{body}</button>
  );
}
