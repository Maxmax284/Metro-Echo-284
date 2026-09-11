import type { CalReadEvent } from "./calendarRead.ts";
import type { CalendarFieldChange, CalendarEventRef } from "./calendarProposal.ts";

export type TelegramCalendarItem = {
  id: string;
  label: string;
  callback_data: string;
};

export type TelegramCalendarDraft = {
  changes: CalendarFieldChange[];
  event_reference?: string | null;
  edit_target?: CalendarEventRef | null;
  expires_at: string;
};

function shortLabel(text: string, max = 34): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function calendarEventButtons(
  rows: Array<CalReadEvent & { id?: string | null }>,
  limit = 6,
): TelegramCalendarItem[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => !!row.id)
    .filter((row) => {
      const key = `${row.title.trim().toLowerCase()}|${row.starts_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((row) => ({
      id: String(row.id),
      label: `Edit ${shortLabel(row.title)}`,
      callback_data: `calevt:${row.id}`,
    }));
}

export function mergeCalendarDraft(
  previous: TelegramCalendarDraft | null | undefined,
  changes: CalendarFieldChange[],
  now = new Date(),
): TelegramCalendarDraft {
  const byField = new Map<string, CalendarFieldChange>();
  for (const change of previous?.changes ?? []) byField.set(change.field, change);
  for (const change of changes) byField.set(change.field, change);
  return {
    changes: [...byField.values()],
    event_reference: previous?.event_reference ?? null,
    edit_target: previous?.edit_target ?? null,
    expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
  };
}

export function activeCalendarDraft(value: unknown, now = new Date()): TelegramCalendarDraft | null {
  const draft = value as TelegramCalendarDraft | null;
  if (!draft || !Array.isArray(draft.changes) || !draft.expires_at) return null;
  return new Date(draft.expires_at).getTime() > now.getTime() ? draft : null;
}

export function calendarDraftContext(draft: TelegramCalendarDraft | null): string {
  if (!draft) return "";
  const facts = draft.changes
    .filter((change) => change.after)
    .map((change) => `${change.field}: ${change.after}`)
    .join("; ");
  const target = draft.edit_target
    ? `Editing the exact event ${draft.edit_target.title} at ${draft.edit_target.starts_at}. `
    : "";
  return `Active calendar draft: ${target}${facts || "waiting for details"}. Merge the user's answer into this same draft. Never start a reminder or a second action.`;
}