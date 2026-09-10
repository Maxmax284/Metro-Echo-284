// calendarConnection — one answer to "whose Google Calendar can Echo reach?".
//
// Order matters: the person's own connected Google account wins. The
// workspace-level connector is only the fallback for the builder's own account.
// If neither is present, calendars stay read-only and nothing pretends otherwise.
import { getConnectionKeyForUser } from "./appUserConnections.ts";
import { GOOGLE_CALENDAR_CONNECTOR_ID } from "./appUserScopes.ts";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GOOGLE_CALENDAR_GATEWAY = `${GATEWAY_BASE_URL}/${GOOGLE_CALENDAR_CONNECTOR_ID}/calendar/v3`;

export type CalendarConnection = {
  /** Gateway connection key — a per-user lovack_* or the workspace connector key. */
  key: string;
  source: "app_user" | "workspace";
};

export function workspaceCalendarKey(): string | null {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const calKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  return apiKey && calKey ? calKey : null;
}

export async function googleCalendarConnection(userId: string): Promise<CalendarConnection | null> {
  if (!Deno.env.get("LOVABLE_API_KEY")) return null;
  try {
    const own = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR_ID);
    if (own) return { key: own, source: "app_user" };
  } catch {
    // fall through to the workspace connector
  }
  const workspace = workspaceCalendarKey();
  return workspace ? { key: workspace, source: "workspace" } : null;
}

/** Headers for a gateway call on this connection. */
export function calendarGatewayHeaders(conn: CalendarConnection): Record<string, string> {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": conn.key,
    "Content-Type": "application/json",
  };
}
