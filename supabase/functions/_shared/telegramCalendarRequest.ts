import { calendarFieldLabel, type CalendarFieldChange } from "./calendarProposal.ts";
import { reminderOffsetsMinutes } from "./reminderActions.ts";
import { looksLikeAppointment, parseReminderHint, type Defaults } from "./reminderParse.ts";

export type NewTelegramCalendarRequest = {
  changes: CalendarFieldChange[];
  title: string;
  due_at: string;
};

/** A backward reference promotes an existing private reminder; a full sentence does not. */
export function explicitlyPromotesExistingReminder(text: string): boolean {
  const t = text.trim();
  return /\b(?:put|add|move)\s+(?:this|that|it|the)\s+(?:private\s+)?reminder\b[\s\S]{0,30}\b(?:on|to|in)\s+(?:my\s+)?calendar\b/i.test(t)
    || /\b(?:put|add|move)\s+(?:this|that|it)\b[\s\S]{0,30}\b(?:on|to|in)\s+(?:my\s+)?calendar\b/i.test(t);
}

function sentenceLocation(text: string): string | null {
  const appointment = text.match(/\bappointment\s+at\s+(.+?)(?=\s+(?:that|which)\s+reminds\b|[.!?]|$)/i);
  if (appointment?.[1]) return appointment[1].trim();
  const place = text.match(/\b(?:meeting|meet|appointment|appt|viewing|showing|interview)\b[\s\S]{0,80}?\bat\s+(.+?)(?=\s+(?:on|this|next|tomorrow|that|which)\b|[.!?]|$)/i);
  return place?.[1]?.trim() || null;
}

function concisePlace(location: string): string {
  return location
    .replace(/\s+(?:about\s+)?(?:\w+\s+){0,3}(?:minute|minutes|hour|hours)\s+(?:away|down the street)(?:\s+from me)?$/i, "")
    .trim();
}

function requestTitle(text: string, location: string | null): string | null {
  if (/\b(?:appointment|appt)\b/i.test(text)) {
    const place = location ? concisePlace(location) : "";
    return place ? `Appointment at ${place.replace(/^the\s+/i, "the ")}` : "Appointment";
  }
  const named = text.match(/\b(?:event|meeting|viewing|showing|interview)\s+(?:called|named|for)\s+(.+?)(?=\s+(?:on|at|this|next|tomorrow)\b|[.!?]|$)/i);
  return named?.[1]?.trim() || null;
}

/**
 * Recognize a complete, self-contained request for a new calendar event.
 * This runs before model tools so an unrelated reminder can never be selected.
 */
export function parseNewTelegramCalendarRequest(text: string, defaults: Defaults): NewTelegramCalendarRequest | null {
  if (!/\bcalendar\b/i.test(text) || explicitlyPromotesExistingReminder(text)) return null;
  if (!looksLikeAppointment(text)) return null;
  const parsed = parseReminderHint(text, defaults);
  if (parsed.status !== "ok") return null;

  const location = sentenceLocation(text);
  const title = requestTitle(text, location);
  if (!title) return null;
  const offsets = reminderOffsetsMinutes(text);
  const change = (field: CalendarFieldChange["field"], after: string): CalendarFieldChange => ({
    field,
    label: calendarFieldLabel(field),
    before: null,
    after,
  });
  return {
    title,
    due_at: parsed.due_at,
    changes: [
      change("existence", title),
      change("title", title),
      change("time", parsed.due_at),
      ...(location ? [change("location", location)] : []),
      ...(offsets.length ? [change("reminder", offsets.join(","))] : []),
    ],
  };
}