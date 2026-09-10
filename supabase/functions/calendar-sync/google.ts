// Reading a live Google Calendar the same way an .ics file is read.
//
// The point is that everything downstream — Today, Schedule, Telegram — keeps
// working against one shape of event. Google is just a better-informed source
// than a subscription link: it knows about changes the moment they happen.
import type { IcsEvent } from "../_shared/ics.ts";
import {
  calendarGatewayHeaders,
  GOOGLE_CALENDAR_GATEWAY,
  type CalendarConnection,
} from "../_shared/calendarConnection.ts";

/** Google event ids become uids so provider identity survives into our rows. */
export function googleUid(eventId: string): string {
  return eventId.endsWith("@google.com") ? eventId : `${eventId}@google.com`;
}

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function toEvent(e: GoogleEvent): IcsEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  const allDay = !!e.start?.date && !e.start?.dateTime;
  const startRaw = e.start?.dateTime ?? e.start?.date ?? null;
  if (!startRaw) return null;
  const start = new Date(allDay ? `${e.start!.date}T00:00:00Z` : startRaw);
  if (!Number.isFinite(start.getTime())) return null;

  const endRaw = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null);
  const end = endRaw ? new Date(endRaw) : null;

  return {
    uid: googleUid(e.id),
    title: e.summary?.trim() || null,
    location: e.location?.trim() || null,
    startsAt: start.toISOString(),
    endsAt: end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
    allDay,
  } as IcsEvent;
}

/**
 * Fetch the same window the .ics path uses, already expanded into single
 * occurrences so recurring entries land as real days.
 */
export async function fetchGoogleEvents(
  conn: CalendarConnection,
  calendarId: string,
  fromMs: number,
  toMs: number,
  max = 400,
): Promise<IcsEvent[]> {
  const out: IcsEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams({
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${GOOGLE_CALENDAR_GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: calendarGatewayHeaders(conn) },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Google Calendar answered ${res.status}: ${text.slice(0, 200)}`);
    }
    let body: { items?: GoogleEvent[]; nextPageToken?: string } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Google Calendar returned something unreadable.");
    }
    for (const item of body.items ?? []) {
      const ev = toEvent(item);
      if (ev) out.push(ev);
      if (out.length >= max) return out;
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return out;
}
