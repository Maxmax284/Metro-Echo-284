// echoCalendarShape — the pure rules for an entry Echo owns.
//
// No network, no Deno: the same shape rules read on the server and in tests.
export type EchoEventInput = {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  project_id?: string | null;
  organization_id?: string | null;
};

export type EchoEventRow = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  description: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
};

const HOUR_MS = 3_600_000;

/** Same shape rule for every surface: a titled, timed entry or nothing. */
export function normalizeEchoEvent(
  input: EchoEventInput,
): { ok: true; value: Required<Pick<EchoEventInput, "title" | "starts_at">> & EchoEventInput } | { ok: false; error: string } {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "An entry needs a name." };
  if (title.length > 200) return { ok: false, error: "That name is too long." };
  const start = new Date(input.starts_at ?? "");
  if (!Number.isFinite(start.getTime())) return { ok: false, error: "That start time is not a real time." };

  const allDay = input.all_day === true;
  let end: Date | null = input.ends_at ? new Date(input.ends_at) : null;
  if (end && !Number.isFinite(end.getTime())) end = null;
  if (end && end.getTime() <= start.getTime()) {
    return { ok: false, error: "The end has to come after the start." };
  }
  if (!end) end = new Date(start.getTime() + (allDay ? 24 * HOUR_MS : HOUR_MS));

  return {
    ok: true,
    value: {
      title,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      all_day: allDay,
      location: (input.location ?? "")?.toString().trim() || null,
      description: (input.description ?? "")?.toString().trim() || null,
      project_id: input.project_id ?? null,
      organization_id: input.organization_id ?? null,
    },
  };
}

function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** The Google body for one Echo row. All-day entries use calendar dates. */
export function googleBodyFor(row: EchoEventRow, timezone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: row.title ?? "Untitled entry",
    ...(row.location ? { location: row.location } : {}),
    ...(row.description ? { description: row.description } : {}),
  };
  if (row.all_day) {
    body.start = { date: dateOnly(row.starts_at) };
    body.end = { date: dateOnly(row.ends_at ?? row.starts_at) };
  } else {
    body.start = { dateTime: row.starts_at, timeZone: timezone || "UTC" };
    body.end = { dateTime: row.ends_at ?? new Date(new Date(row.starts_at).getTime() + HOUR_MS).toISOString(), timeZone: timezone || "UTC" };
  }
  return body;
}

export type RemoteEchoEvent = {
  deleted: boolean;
  title: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
};

/**
 * What actually differs between our row and Google's copy. Pure so both the
 * pull pass and the tests read one definition of "changed in Google".
 */
export function remoteChanges(
  local: EchoEventRow,
  remote: RemoteEchoEvent,
): Partial<Pick<EchoEventRow, "title" | "location" | "starts_at" | "ends_at" | "all_day">> {
  if (remote.deleted) return {};
  const out: Record<string, unknown> = {};
  const sameTime = (a: string | null, b: string | null) => {
    if (!a || !b) return a === b;
    return new Date(a).getTime() === new Date(b).getTime();
  };
  if (remote.title !== null && (remote.title ?? "") !== (local.title ?? "")) out.title = remote.title;
  if ((remote.location ?? null) !== (local.location ?? null)) out.location = remote.location;
  if (remote.starts_at && !sameTime(remote.starts_at, local.starts_at)) out.starts_at = remote.starts_at;
  if (!sameTime(remote.ends_at ?? null, local.ends_at ?? null)) out.ends_at = remote.ends_at;
  if (remote.all_day !== local.all_day) out.all_day = remote.all_day;
  return out as Partial<EchoEventRow>;
}
