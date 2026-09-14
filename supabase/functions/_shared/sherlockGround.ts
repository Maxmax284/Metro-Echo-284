// sherlockGround — the real ground under a Sherlock read.
//
// Doctrine held here:
//  - Facts only. Calendar rows and projects are read as recorded, never invented
//    and never rephrased into something the record does not say.
//  - Dates are spoken in the person's own timezone, with the weekday, so a read
//    can name a real day instead of a bare title.
//  - Reading is not staging. Nothing here writes, proposes or approves.

export type GroundEvent = {
  id: string;
  uid: string | null;
  title: string | null;
  location: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean | null;
  origin: string | null;
  project_id: string | null;
};

export type GroundProject = {
  id: string;
  title: string | null;
  summary: string | null;
  status: string | null;
  updated_at: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Mon Sep 14, 4:00 PM" in the person's own clock. Never the server's. */
export function whenLine(iso: string | null, timezone: string, allDay?: boolean | null): string {
  if (!iso) return "no time recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no time recorded";
  try {
    const opts: Intl.DateTimeFormatOptions = allDay
      ? { timeZone: timezone || "UTC", weekday: "short", month: "short", day: "numeric" }
      : { timeZone: timezone || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    return new Intl.DateTimeFormat("en-US", opts).format(d) + (allDay ? " (all day)" : "");
  } catch {
    return d.toISOString();
  }
}

/** One event as a grounded context line, with project name when it is filed. */
export function eventLine(
  e: GroundEvent,
  timezone: string,
  projectTitle?: string | null,
): string {
  const parts = [`(event:${e.id}) ${e.title ?? "untitled"}`, whenLine(e.starts_at, timezone, e.all_day)];
  if (e.location) parts.push(`at ${e.location}`);
  if (projectTitle) parts.push(`project: ${projectTitle}`);
  if (e.origin) parts.push(e.origin === "echo" ? "created in Echo" : "from calendar feed");
  if (e.description) parts.push(String(e.description).slice(0, 200));
  return parts.join(" · ");
}

export function projectLine(p: GroundProject, itemCount: number): string {
  const parts = [`(project:${p.id}) ${p.title ?? "untitled"}`];
  if (p.status) parts.push(`status ${p.status}`);
  parts.push(`${itemCount} item${itemCount === 1 ? "" : "s"}`);
  if (p.summary) parts.push(String(p.summary).slice(0, 200));
  return parts.join(" · ");
}

/**
 * Reads the person's real calendar window and projects for the active room and
 * returns plain context lines. `days` back/forward bound the window so a read
 * stays about now, not the whole archive.
 */
export async function groundContext(
  sb: any,
  userId: string,
  orgId: string | null,
  opts: { backDays?: number; forwardDays?: number; eventLimit?: number; projectLimit?: number } = {},
): Promise<{ lines: string[]; timezone: string; events: GroundEvent[]; projects: GroundProject[] }> {
  const backDays = opts.backDays ?? 2;
  const forwardDays = opts.forwardDays ?? 21;
  const now = Date.now();
  const from = new Date(now - backDays * DAY_MS).toISOString();
  const to = new Date(now + forwardDays * DAY_MS).toISOString();

  const inRoom = (q: any) => (orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null));

  const [profRes, evRes, projRes] = await Promise.all([
    sb.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    inRoom(
      sb
        .from("calendar_events")
        .select("id, uid, title, location, description, starts_at, ends_at, all_day, origin, project_id")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true })
        .limit(opts.eventLimit ?? 40),
    ),
    inRoom(
      sb
        .from("projects")
        .select("id, title, summary, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(opts.projectLimit ?? 15),
    ),
  ]);

  const timezone = (profRes?.data?.timezone as string) || "UTC";
  const rawEvents: GroundEvent[] = evRes?.data ?? [];
  const projects: GroundProject[] = projRes?.data ?? [];

  // Two feeds can carry the same entry. Echo speaks about it once.
  const seen = new Set<string>();
  const events: GroundEvent[] = [];
  for (const e of rawEvents) {
    const key = `${e.uid ?? e.id}|${e.starts_at ?? ""}`;
    const alt = `${(e.title ?? "").trim().toLowerCase()}|${e.starts_at ?? ""}`;
    if (seen.has(key) || seen.has(alt)) continue;
    seen.add(key);
    seen.add(alt);
    events.push(e);
  }

  const projectTitles = new Map(projects.map((p) => [p.id, p.title]));
  let counts = new Map<string, number>();
  if (projects.length) {
    const { data: items } = await sb
      .from("project_items")
      .select("project_id")
      .in("project_id", projects.map((p) => p.id));
    for (const it of items ?? []) {
      counts.set(it.project_id, (counts.get(it.project_id) ?? 0) + 1);
    }
  }

  const lines: string[] = [];
  for (const e of events) lines.push(eventLine(e, timezone, projectTitles.get(e.project_id ?? "") ?? null));
  for (const p of projects) lines.push(projectLine(p, counts.get(p.id) ?? 0));

  return { lines, timezone, events, projects };
}

/** The person's own clock, so a read can say "today" and mean it. */
export function nowLine(timezone: string): string {
  return `${whenLine(new Date().toISOString(), timezone)} (${timezone || "UTC"})`;
}
