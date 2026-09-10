// useAgenda — the day and week Echo can actually see.
//
// Doctrine:
//  - Read-only. These rows came from a subscribed calendar; nothing here writes
//    back to any calendar, ever.
//  - Scope-filtered like everything else: a workspace calendar belongs to that
//    room only.
//  - Structural: an entry can be filed under a project, which is the user's own
//    organisational work and survives every re-sync.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { listProjects, type Project } from "@/lib/projects";

export type AgendaEvent = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  feed_id: string;
  project_id: string | null;
  /** Which calendar it came from, e.g. "LMT Camp State". */
  feedLabel: string;
  /** Project title when filed, else null. */
  projectTitle: string | null;
};

export type AgendaDay = { key: string; date: Date; events: AgendaEvent[] };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Group into calendar days in the viewer's own local time. */
export function groupByDay(events: AgendaEvent[]): AgendaDay[] {
  const out: AgendaDay[] = [];
  for (const e of events) {
    const d = new Date(e.starts_at);
    const k = dayKey(d);
    const last = out[out.length - 1];
    if (last && last.key === k) last.events.push(e);
    else out.push({ key: k, date: d, events: [e] });
  }
  return out;
}

/** Minutes of open air between two entries, or null when they touch/overlap. */
export function gapMinutes(a: AgendaEvent, b: AgendaEvent): number | null {
  if (a.all_day || b.all_day) return null;
  const end = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.starts_at).getTime();
  const next = new Date(b.starts_at).getTime();
  const mins = Math.round((next - end) / 60000);
  if (mins < 15) return null;
  if (mins > 8 * 60) return null;
  return mins;
}

/**
 * The window Echo can see.
 *
 *  - `days` — a rolling window starting an hour ago (the day and week reads).
 *  - `from`/`to` — an explicit span, for browsing a month that may be behind or
 *    ahead of today. An explicit span always wins over `days`.
 */
export function useAgenda(
  { days = 7, from: fromDate, to: toDate }: { days?: number; from?: Date; to?: Date } = {},
) {
  const { user } = useAuth();
  const { applyScope, orgId, key } = useScope();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  /** Entries running right now, kept apart so they never fake a past day. */
  const [ongoing, setOngoing] = useState<AgendaEvent[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const spanFrom = fromDate ? fromDate.getTime() : null;
  const spanTo = toDate ? toDate.getTime() : null;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const explicit = spanFrom != null && spanTo != null;
      const from = new Date(explicit ? spanFrom! : Date.now() - HOUR_MS).toISOString();
      const to = new Date(explicit ? spanTo! : Date.now() + days * DAY_MS).toISOString();
      const nowIso = new Date().toISOString();
      const columns =
        "id,title,starts_at,ends_at,all_day,location,feed_id,project_id,calendar_feeds(label)";
      const [{ data, error: err }, running, projs] = await Promise.all([
        applyScope(supabase.from("calendar_events").select(columns))
          .gte("starts_at", from)
          .lte("starts_at", to)
          .order("starts_at", { ascending: true })
          .limit(explicit ? 500 : 120),
        /* Entries that began before this window and have not ended — a stay, a
           travel week. Without this read they never appear in a day at all. */
        explicit
          ? Promise.resolve({ data: [] as any[], error: null })
          : applyScope(supabase.from("calendar_events").select(columns))
              .lte("starts_at", nowIso)
              .gt("ends_at", nowIso)
              .order("ends_at", { ascending: true })
              .limit(10),
        listProjects({ userId: user.id, organizationId: orgId ?? null }).catch(() => [] as Project[]),
      ]);
      if (err) throw err;

      const byId = new Map((projs ?? []).map((p) => [p.id, p.title]));
      setProjects(projs ?? []);
      const shape = (r: any): AgendaEvent => ({
        id: r.id,
        title: r.title,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        all_day: r.all_day,
        location: r.location,
        feed_id: r.feed_id,
        project_id: r.project_id ?? null,
        feedLabel: r.calendar_feeds?.label ?? "Calendar",
        projectTitle: r.project_id ? (byId.get(r.project_id) ?? null) : null,
      });
      const windowRows = ((data ?? []) as any[]).map(shape);
      const windowIds = new Set(windowRows.map((r) => r.id));
      setEvents(windowRows);
      setOngoing(
        (((running as any)?.data ?? []) as any[]).map(shape).filter((r) => !windowIds.has(r.id)),
      );


    } catch (e: any) {
      setError(e?.message ?? "The calendar could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, orgId, days, spanFrom, spanTo]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** File an entry under a project (or clear it). Local, reversible, audited by the row itself. */
  const setProject = useCallback(
    async (eventId: string, project: Project | null) => {
      const { error: err } = await supabase
        .from("calendar_events")
        .update({ project_id: project?.id ?? null })
        .eq("id", eventId);
      if (err) throw err;
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? { ...e, project_id: project?.id ?? null, projectTitle: project?.title ?? null }
            : e,
        ),
      );
    },
    [],
  );

  const days_ = useMemo(() => groupByDay(events), [events]);

  return { events, days: days_, projects, loading, error, refresh, setProject };
}
