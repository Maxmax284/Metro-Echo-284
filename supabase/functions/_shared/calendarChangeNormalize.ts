import {
  calendarFieldLabel,
  normalizeCalendarChangeField,
  parseReminderOffsets,
  type CalendarFieldChange,
} from "./calendarProposal.ts";
import { reminderOffsetsMinutes } from "./reminderActions.ts";
import { parseReminderHint, type Defaults } from "./reminderParse.ts";

/**
 * Provider-safe calendar changes. Models may describe a wall-clock time in
 * plain English, and may put a requested reminder in `before`. Normalize both
 * before the proposal is shown so approval can never bless an unwritable body.
 */
export function normalizeCalendarChanges(raw: unknown, defaults: Defaults): CalendarFieldChange[] {
  const normalized = (Array.isArray(raw) ? raw : []).map((candidate: any) => {
    const field = normalizeCalendarChangeField(candidate?.field);
    let before = candidate?.before != null && String(candidate.before).trim()
      ? String(candidate.before).trim()
      : null;
    let after = candidate?.after != null && String(candidate.after).trim()
      ? String(candidate.after).trim()
      : null;

    if (field === "time" && after) {
      /* Native Date accepts incomplete phrases such as "September 22" and
         silently invents a year (often 2001). Calendar approval must never
         bless an invented instant. Only explicit ISO timestamps pass through;
         every human phrase uses the same wall-clock parser as Telegram. */
      const explicitInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(after)
        && !Number.isNaN(new Date(after).getTime());
      if (!explicitInstant) {
        const parsed = parseReminderHint(after, defaults);
        after = parsed.status === "ok" ? parsed.due_at : null;
      }
    }

    if (field === "attendee") {
      /* Guests are emails, nothing else. Keep only real addresses; a change
         with no valid email must not pretend it invites anyone. */
      const emails = extractEmails(after ?? before);
      if (emails.length === 0) return null;
      before = null;
      after = emails.join(", ");
    }

    if (field === "reminder") {
      // On a newly described reminder, models sometimes place the requested
      // value in `before` and omit `after`. That is an addition, not a removal.
      const requested = after ?? before;
      if (requested) {
        const natural = reminderOffsetsMinutes(requested);
        const offsets = natural.length ? natural : parseReminderOffsets(requested);
        after = offsets.join(",");
        if (candidate?.after == null) before = null;
      }
    }

    return { field, label: calendarFieldLabel(field), before, after };
  }).filter((change): change is CalendarFieldChange => change !== null);

  const existence = normalized.find((change) => change.field === "existence")?.after?.trim() ?? "";
  const hasTitle = normalized.some((change) => change.field === "title" && change.after?.trim());
  if (existence && !hasTitle && !/^(create|add|new|event)$/i.test(existence)) {
    normalized.push({ field: "title", label: calendarFieldLabel("title"), before: null, after: existence });
  }

  const reminders = normalized.filter((change) => change.field === "reminder");
  if (reminders.length <= 1) return normalized;
  const offsets = [...new Set(reminders.flatMap((change) => parseReminderOffsets(change.after)))]
    .sort((a, b) => b - a);
  const firstReminder = normalized.findIndex((change) => change.field === "reminder");
  const withoutReminders = normalized.filter((change) => change.field !== "reminder");
  withoutReminders.splice(firstReminder, 0, {
    field: "reminder",
    label: calendarFieldLabel("reminder"),
    before: null,
    after: offsets.join(","),
  });
  return withoutReminders;
}

/** Pull valid email addresses out of free text; deduped, lowercased. */
export function extractEmails(raw: unknown): string[] {
  if (raw == null) return [];
  const text = Array.isArray(raw) ? raw.join(" ") : String(raw);
  const matches = text.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

/** A creation must identify both what it is and when it happens. */
export function calendarCreationMissing(changes: CalendarFieldChange[]): "title" | "time" | null {
  const existence = changes.find((change) => change.field === "existence")?.after?.trim() ?? "";
  const title = changes.find((change) => change.field === "title")?.after?.trim() ?? "";
  const meaningfulExistence = existence && !/^(create|add|new|event)$/i.test(existence);
  if (!title && !meaningfulExistence) return "title";
  const time = changes.find((change) => change.field === "time")?.after?.trim() ?? "";
  if (!time || Number.isNaN(new Date(time).getTime())) return "time";
  return null;
}

/** Enough concrete detail to rescue a create request that was mislabelled as an edit. */
export function hasCalendarCreationDetails(changes: CalendarFieldChange[]): boolean {
  const title = changes.find((change) => change.field === "title")?.after?.trim() ?? "";
  const time = changes.find((change) => change.field === "time")?.after?.trim() ?? "";
  const explicitInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time)
    && !Number.isNaN(new Date(time).getTime());
  return !!title && explicitInstant;
}