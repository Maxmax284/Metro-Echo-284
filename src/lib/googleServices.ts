// googleServices — one client path for connecting any single Google service.
//
// The browser never touches a provider token: it asks the backend for a consent
// URL, opens it in a popup, and the popup hands a one-time code back to the
// backend. One service per consent, so granting mail never touches calendar.
import { supabase } from "@/integrations/supabase/client";

export const GOOGLE_CONNECTORS = ["google_calendar", "google_mail", "google_drive"] as const;
export type GoogleConnectorId = (typeof GOOGLE_CONNECTORS)[number];

export type GoogleServiceStatus = {
  service: GoogleConnectorId;
  connected: boolean;
  offerable: boolean;
  account: string | null;
  failing: boolean;
  detail: string | null;
};

export type GoogleAccountStatus = {
  signedIn: boolean;
  account: string | null;
  services: GoogleServiceStatus[];
};

const EMPTY_SERVICES: GoogleServiceStatus[] = GOOGLE_CONNECTORS.map((service) => ({
  service,
  connected: false,
  offerable: false,
  account: null,
  failing: false,
  detail: null,
}));

/** This person's own grants. Never the workspace's. */
export async function readGoogleAccountStatus(): Promise<GoogleAccountStatus> {
  const { data, error } = await supabase.functions.invoke("google-account-status", { body: {} });
  if (error) return { signedIn: false, account: null, services: EMPTY_SERVICES };
  const body = data as {
    signed_in?: boolean;
    account?: string | null;
    services?: GoogleServiceStatus[];
  } | null;
  return {
    signedIn: !!body?.signed_in,
    account: body?.account ?? null,
    services: body?.services?.length ? body.services : EMPTY_SERVICES,
  };
}

function waitForOAuthCompletion(popup: Window, connectorId: GoogleConnectorId): Promise<void> {
  return new Promise((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; connectorId?: string; reason?: string } | null;
      const type = payload?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        payload?.connectorId !== connectorId ||
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
      reject(new Error(payload?.reason ?? "That sign-in did not finish."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before it finished."));
    }, 500);
  });
}

/** Start consent for one service. Call straight from a click so the popup lives. */
export async function connectGoogleService(
  connectorId: GoogleConnectorId,
  organizationId: string | null,
  opts: { withSend?: boolean } = {},
): Promise<void> {
  const popup = window.open("", `metro-echo-${connectorId}`, "width=600,height=720");
  if (!popup) throw new Error("Your browser blocked the Google window. Allow pop-ups and try again.");
  try {
    sessionStorage.setItem("metro-echo:google-service", connectorId);
    sessionStorage.setItem("metro-echo:google-calendar-org", organizationId ?? "");
    const { data, error } = await supabase.functions.invoke("app-user-oauth-start", {
      body: { origin: window.location.origin, connector_id: connectorId, with_send: opts.withSend === true },
    });
    if (error) {
      const detail = await readInvokeError(error);
      throw new Error(detail ?? "Could not start the Google sign-in.");
    }
    const url = (data as { authorizationUrl?: string } | null)?.authorizationUrl;
    if (!url) throw new Error("Could not start the Google sign-in.");
    const done = waitForOAuthCompletion(popup, connectorId);
    popup.location.href = url;
    await done;
  } catch (e) {
    popup.close();
    throw e;
  }
}

export async function disconnectGoogleService(connectorId: GoogleConnectorId): Promise<void> {
  const { error } = await supabase.functions.invoke("google-disconnect", {
    body: { connector_id: connectorId },
  });
  if (error) throw error;
}

/** The real reason behind "non-2xx", so a missing setup reads as a sentence. */
async function readInvokeError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
  if (!ctx?.text) return null;
  try {
    const body = JSON.parse(await ctx.text()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}
