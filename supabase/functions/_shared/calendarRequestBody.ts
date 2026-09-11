// calendarRequestBody — pure mapping from a staged proposal to the Google
// Calendar write. No env, no fetch: safe to unit-test and to reuse anywhere.
import {
  attendeeAdds,
  isCancellation,
  isCreation,
  normalizeCalendarChangeField,
  parseReminderOffsets,
  providerEventIdFromUid,
  type CalendarEventRef,
  type CalendarExecuteMode,
  type CalendarProposal,
} from "./calendarProposal.ts";

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

  /* Google emails guests when told to — invites, updates and cancellations
     reach the people on the event instead of silently changing their day. */
  const guestAdds = attendeeAdds(proposal);
  const notifyQuery = guestAdds.length > 0 || proposal.attendee_count > 0 ? "?sendUpdates=all" : "";

  // Cancellation path: no body, just delete the provider event.
  if (isCancellation(proposal)) {
    const eventUid = proposal.event?.uid ?? null;
    const eventId = providerEventIdFromUid(eventUid);
    if (!eventId) throw new Error("Cannot cancel: this event did not come from Google Calendar");
    return { method: "DELETE", path: `calendars/${calendarId}/events/${encodeURIComponent(eventId)}${notifyQuery}`, operation: "delete" };
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
      case "attendee": {
        /* Guests ride Google's attendee list so Google itself emails the
           invite and tracks the yes/no. On an update, executeCalendarProposal
           merges this list with whoever is already on the event first, so a
           PATCH never silently drops an existing guest. */
        const emails = guestAdds;
        if (emails.length > 0) body.attendees = emails.map((email) => ({ email }));
        break;
      }
      case "reminder": {
        body.reminders = {
          useDefault: false,
          overrides: parseReminderOffsets(after).map((minutes) => ({ method: "popup", minutes })),
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
    body.summary = proposal.changes.find((c) => normalizeCalendarChangeField(c.field) === "title")?.after
      ?? proposal.changes.find((c) => normalizeCalendarChangeField(c.field) === "existence")?.after
      ?? "New event";
    return { method: "POST", path: `calendars/${calendarId}/events${notifyQuery}`, body, operation: "create" };
  }

  if (!existingEventId) {
    throw new Error("Cannot update: this event did not come from Google Calendar");
  }

  return {
    method: "PATCH",
    path: `calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}${notifyQuery}`,
    body,
    operation: "update",
  };
}
