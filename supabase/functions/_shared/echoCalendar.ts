// echoCalendar — events Echo itself owns.
//
// Doctrine:
//   - A feed row is a sense: read-only, replaced on every sync. An Echo row is
//     the person's own entry: created, edited and deleted here.
//   - Google is a mirror, never the owner of an Echo row. The mirror can be
//     switched off without losing the entry.
//   - Both directions are honest: what Echo writes to Google it can also read
//     back, and a time changed in Google lands here on the next check.
//   - Nothing silent: every push records its outcome on the row (sync_state,
//     sync_error, synced_at) so the glass can tell the truth.
import {
  calendarGatewayHeaders,
  GOOGLE_CALENDAR_GATEWAY,
  type CalendarConnection,
} from "./calendarConnection.ts";

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

async function gateway(
  conn: CalendarConnection,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${GOOGLE_CALENDAR_GATEWAY}${path}`, {
    method,
    headers: calendarGatewayHeaders(conn),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json, text };
}

export async function pushEchoEventToGoogle(
  conn: CalendarConnection,
  row: EchoEventRow,
  timezone: string,
  calendarId = "primary",
): Promise<{ event_id: string; calendar_id: string }> {
  const body = googleBodyFor(row, timezone);
  const existing = row.google_event_id;
  const res = existing
    ? await gateway(conn, "PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing)}`, body)
    : await gateway(conn, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, body);
  if (!res.ok) throw new Error(`google_calendar ${res.status}: ${res.text.slice(0, 200)}`);
  const id = String((res.json as { id?: string }).id ?? existing ?? "");
  if (!id) throw new Error("Google did not return an entry id.");
  return { event_id: id, calendar_id: calendarId };
}

export async function deleteEchoEventFromGoogle(
  conn: CalendarConnection,
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  const res = await gateway(conn, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  // Already gone is a success: the mirror matches either way.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`google_calendar ${res.status}: ${res.text.slice(0, 200)}`);
  }
}

export type RemoteEchoEvent = {
  deleted: boolean;
  title: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
};

export async function readEchoEventFromGoogle(
  conn: CalendarConnection,
  eventId: string,
  calendarId = "primary",
): Promise<RemoteEchoEvent | null> {
  const res = await gateway(conn, "GET", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  if (res.status === 404 || res.status === 410) return { deleted: true, title: null, location: null, starts_at: null, ends_at: null, all_day: false };
  if (!res.ok) return null;
  const e = res.json as {
    status?: string;
    summary?: string;
    location?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
  };
  if (e.status === "cancelled") return { deleted: true, title: null, location: null, starts_at: null, ends_at: null, all_day: false };
  const allDay = !!e.start?.date && !e.start?.dateTime;
  const startRaw = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
  const endRaw = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null);
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  return {
    deleted: false,
    title: e.summary?.trim() || null,
    location: e.location?.trim() || null,
    starts_at: start && Number.isFinite(start.getTime()) ? start.toISOString() : null,
    ends_at: end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
    all_day: allDay,
  };
}

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
