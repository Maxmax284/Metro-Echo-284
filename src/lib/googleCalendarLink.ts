// googleCalendarLink — one client-side path for connecting a person's own
// Google Calendar.
//
// The browser never touches a provider token: it asks the backend for a consent
// URL, opens it in a popup, and the popup hands a one-time code back to the
// backend. Everything durable lives server-side.
import { supabase } from "@/integrations/supabase/client";
import { ensurePopupSession, readInvokeError } from "@/lib/googleServices";

export const GOOGLE_CALENDAR_CONNECTOR_ID = "google_calendar";

export type CalendarWriteState = "read_only" | "connected";

export async function readCalendarWriteState(): Promise<CalendarWriteState> {
  const { data, error } = await supabase.functions.invoke("calendar-write-status", { body: {} });
  if (error) return "read_only";
  return (data as { write_state?: CalendarWriteState } | null)?.write_state === "connected"
    ? "connected"
    : "read_only";
}

/**
 * Wait for the Google popup to hand back its one-time code, then finish the
 * exchange HERE, in the signed-in main window. The popup may not hold the
 * session (inside the editor preview the sign-in is brokered to this window),
 * so the popup relays and we complete — the key never touches any window.
 */
function waitForOAuthCompletion(popup: Window, organizationId: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    let poll: number | undefined;
    let finishing = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; connectorId?: string; reason?: string; code?: string }
        | null;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        payload?.connectorId !== GOOGLE_CALENDAR_CONNECTOR_ID
      ) {
        return;
      }

      if (payload.type === "appUserConnectorOAuthRelay") {
        const code = typeof payload.code === "string" ? payload.code : "";
        if (!code || finishing) return;
        finishing = true;
        void (async () => {
          try {
            const { error } = await supabase.functions.invoke("app-user-oauth-complete", {
              body: { code, organization_id: organizationId },
            });
            if (error) {
              const detail = await readInvokeError(error);
              throw new Error(detail ?? "Could not finish the connection.");
            }
            cleanup();
            popup.close();
            resolve();
          } catch (e) {
            cleanup();
            popup.close();
            reject(e instanceof Error ? e : new Error("Could not finish the connection."));
          }
        })();
        return;
      }

      if (payload.type === "appUserConnectorOAuthComplete") {
        cleanup();
        resolve();
        return;
      }
      if (payload.type === "appUserConnectorOAuthFailed") {
        cleanup();
        popup.close();
        reject(new Error(payload.reason ?? "That sign-in did not finish."));
      }
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      // While the exchange is running the popup may already be closing —
      // only a user-closed popup before the code arrived is a failure.
      if (finishing || !popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before it finished."));
    }, 500);
  });
}

/** Start consent. Must be called straight from a click so the popup survives. */
export async function connectGoogleCalendar(organizationId: string | null): Promise<void> {
  await ensurePopupSession();
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
    const done = waitForOAuthCompletion(popup, organizationId);
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
