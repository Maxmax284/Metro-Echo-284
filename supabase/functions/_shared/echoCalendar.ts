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

export {
  googleBodyFor,
  normalizeEchoEvent,
  remoteChanges,
  type EchoEventInput,
  type EchoEventRow,
  type RemoteEchoEvent,
} from "./echoCalendarShape.ts";
import { googleBodyFor, type EchoEventRow, type RemoteEchoEvent } from "./echoCalendarShape.ts";

const HOUR_MS = 3_600_000;

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

