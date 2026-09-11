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

    if (field === "time" && after && Number.isNaN(new Date(after).getTime())) {
      const parsed = parseReminderHint(after, defaults);
      if (parsed.status === "ok") after = parsed.due_at;
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
  });

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