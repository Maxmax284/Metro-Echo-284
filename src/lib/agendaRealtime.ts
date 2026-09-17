import { matchesScope, type ScopeContract } from "@/lib/scope";

export type CalendarChangePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: { user_id?: string; organization_id?: string | null } | null;
  old?: { user_id?: string; organization_id?: string | null } | null;
};

/**
 * Realtime sends the previous row for deletes and the current row otherwise.
 * Keep this rule pure so the agenda subscription cannot leak another room into
 * the refresh path, including when a row moves between scopes.
 */
export function agendaChangeTouchesScope(
  payload: CalendarChangePayload,
  userId: string,
  scope: ScopeContract,
): boolean {
  const candidates = payload.eventType === "DELETE"
    ? [payload.old]
    : payload.eventType === "UPDATE"
      ? [payload.old, payload.new]
      : [payload.new];

  return candidates.some((row) => row?.user_id === userId && matchesScope(row, scope));
}