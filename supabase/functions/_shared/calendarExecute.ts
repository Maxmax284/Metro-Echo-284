// calendarExecute — the ONE Google Calendar execution path.
//
// Both Telegram Yes and the in-app Execute button route calendar_change
// proposals through here so the same provider result, the same audit receipt,
// and the same local projection happen no matter which surface said go.
//
// Reads stay honest: if the connector isn't present, nothing claims a write.
import {
  calendarProposalRisk,
  isCalendarProposal,
  isCancellation,
  isCreation,
  normalizeCalendarChangeField,
  providerEventIdFromUid,
  type CalendarEventRef,
  type CalendarExecuteMode,
  type CalendarFieldChange,
  type CalendarProposal,
} from "./calendarProposal.ts";
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  calendarGatewayHeaders,
  googleCalendarConnection,
  type CalendarConnection,
} from "./calendarConnection.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

type SbClient = ReturnType<typeof createClient>;

export type CalendarExecuteResult = {
  provider: "google_calendar";
  operation: CalendarExecuteMode;
  calendar_id: string;
  event_id: string;
  html_link?: string;
  etag?: string;
  /** ISO start that was actually written, when known. */
  start?: string;
  end?: string;
};

export function calendarWriteStateFromEnv(): "read_only" | "connected" {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const calKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  return apiKey && calKey ? "connected" : "read_only";
}

/**
 * Whether THIS person can write to Google right now. Their own connected
 * account counts first; the workspace connector is only a fallback.
 */
export async function calendarWriteStateForUser(userId: string): Promise<"read_only" | "connected"> {
  const conn = await googleCalendarConnection(userId);
  return conn ? "connected" : "read_only";
}

function authHeaders(conn: CalendarConnection): Record<string, string> {
  return calendarGatewayHeaders(conn);
}

function parseIso(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function isAllDayString(v: string | null): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function durationMinutes(startIso: string, endIso: string | null): number {
  const s = new Date(startIso).getTime();
  const e = endIso ? new Date(endIso).getTime() : 0;
  if (e > s) return Math.round((e - s) / 60_000);
  return 60;
}

/** Build the Google Calendar event body from the proposal and the user's timezone. */
export function buildCalendarRequestBody(
  proposal: CalendarProposal,
  timeZone: string,
): { method: "POST" | "PATCH" | "DELETE"; path: string; body?: Record<string, unknown>; operation: CalendarExecuteMode } {
  const calendarId = encodeURIComponent("primary");

  // Cancellation path: no body, just delete the provider event.
  if (isCancellation(proposal)) {
    const eventUid = proposal.event?.uid ?? null;
    const eventId = providerEventIdFromUid(eventUid);
    if (!eventId) throw new Error("Cannot cancel: this event did not come from Google Calendar");
    return { method: "DELETE", path: `calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, operation: "delete" };
  }

  // Update path: patch only the changed fields on the existing event.
  const existingEventId = proposal.event ? providerEventIdFromUid(proposal.event.uid) : null;

  const body: Record<string, unknown> = {};

  for (const change of proposal.changes) {
    const field = normalizeCalendarChangeField(change.field);
    const after = change.after;
    switch (field) {
      case "title":
        body.summary = after;
        break;
      case "location":
        body.location = after ?? undefined;
        break;
      case "description":
        body.description = after ?? undefined;
        break;
      case "reminder": {
        const minutes = String(after ?? "")
          .split(/[^0-9]+/)
          .map(Number)
          .filter((value) => Number.isFinite(value) && value >= 0);
        body.reminders = {
          useDefault: false,
          overrides: (minutes.length ? minutes : [15]).slice(0, 5).map((value) => ({ method: "popup", minutes: value })),
        };
        break;
      }
      case "time": {
        if (isAllDayString(after)) {
          body.start = { date: after };
          body.end = { date: after };
        } else {
          const iso = parseIso(after);
          if (!iso) throw new Error(`Could not understand the new time: ${after}`);
          // Preserve original duration when we know it; default to one hour.
          const originalStart = proposal.event?.starts_at ? parseIso(proposal.event.starts_at) : null;
          const originalEnd = (proposal.event as CalendarEventRef | null)?.ends_at
            ? parseIso((proposal.event as CalendarEventRef).ends_at)
            : null;
          const dur = originalStart ? durationMinutes(originalStart, originalEnd) : 60;
          const endIso = new Date(new Date(iso).getTime() + dur * 60_000).toISOString();
          body.start = { dateTime: iso, timeZone };
          body.end = { dateTime: endIso, timeZone };
        }
        break;
      }
      default:
        break;
    }
  }

  // For a brand-new event, require at least a title and a time.
  if (isCreation(proposal)) {
    if (!body.start) throw new Error("New events need a time.");
    body.summary = proposal.changes.find((c) => normalizeCalendarChangeField(c.field) === "title")?.after ?? "New event";
    return { method: "POST", path: `calendars/${calendarId}/events`, body, operation: "create" };
  }

  if (!existingEventId) {
    throw new Error("Cannot update: this event did not come from Google Calendar");
  }

  return {
    method: "PATCH",
    path: `calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}`,
    body,
    operation: "update",
  };
}

/** Fetch the user's timezone from their profile when no executor config supplies one. */
async function userTimeZone(sb: SbClient, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  return data?.timezone ?? "UTC";
}

/**
 * Pick or create a default Google Calendar executor for this user.
 * Returns null when the connector is not wired, so callers can fail honestly.
 */
export async function ensureGoogleCalendarExecutor(
  sb: SbClient,
  userId: string,
): Promise<string | null> {
  if ((await calendarWriteStateForUser(userId)) === "read_only") return null;

  const { data: existing } = await sb
    .from("action_executors")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "google_calendar")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const tz = await userTimeZone(sb, userId);
  const { data: inserted, error } = await sb
    .from("action_executors")
    .insert({
      user_id: userId,
      name: "Google Calendar",
      kind: "google_calendar",
      enabled: true,
      config: { calendar_id: "primary", timeZone: tz },
    } as any)
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[calendarExecute] failed to create default executor:", error?.message);
    return null;
  }
  return inserted.id;
}

/** Call the connector gateway and return a normalized result. */
export async function executeCalendarProposal(
  sb: SbClient,
  userId: string,
  action: { id: string; payload: Record<string, unknown> | null; title?: string | null },
): Promise<CalendarExecuteResult> {
  const proposal = action.payload as CalendarProposal | null;
  if (!proposal || !isCalendarProposal(proposal)) {
    throw new Error("not a calendar proposal");
  }
  const conn = await googleCalendarConnection(userId);
  if (!conn) {
    throw new Error("Google Calendar is not connected for this account");
  }

  const tz = await userTimeZone(sb, userId);
  const { method, path, body, operation } = buildCalendarRequestBody(proposal, tz);

  const res = await fetch(`${GATEWAY}/${path}`, {
    method,
    headers: authHeaders(conn),
    ...(method !== "DELETE" && body ? { body: JSON.stringify(body) } : {}),
  });

  const rawText = await res.text().catch(() => "");
  let rawJson: Record<string, unknown> = {};
  try {
    rawJson = rawText ? JSON.parse(rawText) : {};
  } catch {
    rawJson = { rawText };
  }

  if (!res.ok) {
    throw new Error(`google_calendar ${res.status}: ${JSON.stringify(rawJson).slice(0, 300)}`);
  }

  const eventId = String(rawJson.id ?? "");
  if (!eventId && operation !== "delete") {
    throw new Error("google_calendar returned no event id");
  }

  const result: CalendarExecuteResult = {
    provider: "google_calendar",
    operation,
    calendar_id: "primary",
    event_id: eventId || providerEventIdFromUid(proposal.event?.uid ?? null) || "deleted",
    html_link: typeof rawJson.htmlLink === "string" ? rawJson.htmlLink : undefined,
    etag: typeof rawJson.etag === "string" ? rawJson.etag : undefined,
  };

  if (operation !== "delete") {
    const start = body?.start;
    const end = body?.end;
    if (start && typeof start === "object") {
      const s = start as Record<string, unknown>;
      result.start = typeof s.dateTime === "string" ? s.dateTime : typeof s.date === "string" ? `${s.date}T00:00:00.000Z` : undefined;
    }
    if (end && typeof end === "object") {
      const e = end as Record<string, unknown>;
      result.end = typeof e.dateTime === "string" ? e.dateTime : typeof e.date === "string" ? `${e.date}T23:59:59.000Z` : undefined;
    }
  }

  return result;
}

/** Find an active iCal feed to project a freshly created/updated event into. */
async function findProjectionFeed(sb: SbClient, userId: string, fallbackFeedId: string | null): Promise<string | null> {
  if (fallbackFeedId) return fallbackFeedId;
  // Prefer the person's own Google feed: that's the calendar we just wrote to.
  const { data: google } = await sb
    .from("calendar_feeds")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("provider", "google")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (google?.id) return google.id;
  const { data } = await sb
    .from("calendar_feeds")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Write the provider result into calendar_events so Today/Schedule reflect it
 * immediately, before the next iCal sync runs. This is a local echo only:
 * the next scheduled sync is still the source of truth and will replace the
 * projection with the feed's own view of the same UID.
 */
export async function projectCalendarEvent(
  sb: SbClient,
  userId: string,
  proposal: CalendarProposal,
  result: CalendarExecuteResult,
): Promise<void> {
  const feedId = await findProjectionFeed(sb, userId, proposal.event?.feed_id ?? null);
  if (!feedId) return;

  const uid = result.operation === "create"
    ? `${result.event_id}@google.com`
    : proposal.event?.uid ?? `${result.event_id}@google.com`;

  if (result.operation === "delete") {
    await sb.from("calendar_events").delete().eq("feed_id", feedId).eq("uid", uid);
    return;
  }

  const titleChange = proposal.changes.find((c) => normalizeCalendarChangeField(c.field) === "title");
  const locationChange = proposal.changes.find((c) => normalizeCalendarChangeField(c.field) === "location");

  const allDay = !!result.start && /^\d{4}-\d{2}-\d{2}T/.test(result.start) && result.start.endsWith("T00:00:00.000Z");

  const startsAt = result.start ?? new Date().toISOString();
  const endsAt = result.end ?? (allDay
    ? `${startsAt.split("T")[0]}T23:59:59.000Z`
    : new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString());

  const row = {
    user_id: userId,
    organization_id: null,
    feed_id: feedId,
    uid,
    title: titleChange?.after ?? proposal.event?.title ?? "Calendar event",
    location: locationChange?.after ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
  };

  const { error } = await sb
    .from("calendar_events")
    .upsert(row, { onConflict: "feed_id,uid,starts_at", ignoreDuplicates: false });
  if (error) {
    // Projection is a convenience; a failure here must not break execution.
    console.error("[calendarExecute] projection failed:", error.message);
  }
}

/** Whether Telegram Yes may execute directly or only approve and hand off. */
export function telegramMayAutoExecute(proposal: CalendarProposal): boolean {
  // The proposal carries the write state it was staged with; the caller checks it.
  if (proposal.write_state === "read_only") return false;
  // High-risk changes (cancelling with attendees, or anything explicitly high)
  // still need the stronger in-app gate.
  return calendarProposalRisk(proposal) !== "high";
}
