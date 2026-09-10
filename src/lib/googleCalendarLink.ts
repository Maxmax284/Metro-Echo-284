// googleCalendarLink — one client-side path for connecting a person's own
// Google Calendar.
//
// The browser never touches a provider token: it asks the backend for a consent
// URL, opens it in a popup, and the popup hands a one-time code back to the
// backend. Everything durable lives server-side.
import { supabase } from "@/integrations/supabase/client";

export const GOOGLE_CALENDAR_CONNECTOR_ID = "google_calendar";

export type CalendarWriteState = "read_only" | "connected";

export async function readCalendarWriteState(): Promise<CalendarWriteState> {
  const { data, error } = await supabase.functions.invoke("calendar-write-status", { body: {} });
  if (error) return "read_only";
  return (data as { write_state?: CalendarWriteState } | null)?.write_state === "connected"
    ? "connected"
    : "read_only";
}

/** Resolve when the popup reports the connection was stored, reject with why not. */
function waitForOAuthCompletion(popup: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (event.data as { connectorId?: string } | null)?.connectorId !== GOOGLE_CALENDAR_CONNECTOR_ID ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve();
        return;
      }
      popup.close();
      reject(new Error((event.data as { reason?: string }).reason ?? "That sign-in did not finish."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before it finished."));
    }, 500);
  });
}

/** Start consent. Must be called straight from a click so the popup survives. */
export async function connectGoogleCalendar(organizationId: string | null): Promise<void> {
  const popup = window.open("", "metro-echo-google-calendar", "width=600,height=720");
  if (!popup) throw new Error("Your browser blocked the Google window. Allow pop-ups and try again.");
  try {
    sessionStorage.setItem(
      "metro-echo:google-calendar-org",
      organizationId ?? "",
    );
    const { data, error } = await supabase.functions.invoke("app-user-oauth-start", {
      body: { origin: window.location.origin },
    });
    if (error) throw error;
    const url = (data as { authorizationUrl?: string } | null)?.authorizationUrl;
    if (!url) throw new Error("Could not start the Google sign-in.");
    const done = waitForOAuthCompletion(popup);
    popup.location.href = url;
    await done;
  } catch (e) {
    popup.close();
    throw e;
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const { error } = await supabase.functions.invoke("google-calendar-disconnect", { body: {} });
  if (error) throw error;
}
