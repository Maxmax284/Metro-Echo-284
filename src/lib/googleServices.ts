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
  /** Working right now, however it was granted. */
  working?: boolean;
  /** "you" = your own sign-in, "app" = this app's shared Google link. */
  via?: "you" | "app" | null;
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
  working: false,
  via: null,
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

/**
 * Wait for the Google popup to hand back its one-time code, then finish the
 * exchange HERE, in the signed-in main window. The popup may not hold the
 * session (inside the editor preview the sign-in is brokered to this window),
 * so the popup relays and we complete — the key never touches any window.
 */
function waitForOAuthCompletion(
  popup: Window,
  connectorId: GoogleConnectorId,
  organizationId: string | null,
): Promise<void> {
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
        payload?.connectorId !== connectorId
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

/** The storage key supabase-js would use in a plain (non-brokered) window. */
function popupStorageKey(): string {
  const url: string = import.meta.env.VITE_SUPABASE_URL ?? "";
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)?.[1];
  return ref ? `sb-${ref}-auth-token` : "";
}

/**
 * The Google popup is a top-level window: it reads its sign-in from plain
 * localStorage, not from the editor broker the preview iframe uses. Make sure
 * the plain copy exists before opening it, or the popup arrives signed out
 * and the exchange is refused with a silent 401.
 */
export async function ensurePopupSession(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const key = popupStorageKey();
    if (!session || !key) return;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(session));
    }
  } catch {
    // Best effort — the popup may still find its own session.
  }
}

/** Start consent for one service. Call straight from a click so the popup lives. */
export async function connectGoogleService(
  connectorId: GoogleConnectorId,
  organizationId: string | null,
  opts: { withSend?: boolean } = {},
): Promise<void> {
  await ensurePopupSession();
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
    const done = waitForOAuthCompletion(popup, connectorId, organizationId);
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
export async function readInvokeError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
  if (!ctx?.text) return null;
  try {
    const body = JSON.parse(await ctx.text()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}
