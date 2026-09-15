// The small window Google sends you back to, for any one Google service.
//
// It holds a one-time code and says one true thing before closing. It never
// sees a token and never claims success early.
//
// It finishes the exchange itself from its own (plain localStorage) sign-in —
// Google's pages sever the opener link, so the main window cannot finish for
// it. The connect step copies the session into plain storage before opening
// this window, so a popup born in the editor preview is signed in too. If a
// main window is somehow still listening, a relay is attempted first anyway.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readInvokeError } from "@/lib/googleServices";

export default function GoogleReturn() {
  const [message, setMessage] = useState("Finishing the connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectorId = params.get("service")
      || sessionStorage.getItem("metro-echo:google-service")
      || "google_calendar";

    const fail = (reason: string) => {
      setMessage(reason);
      window.opener?.postMessage(
        { type: "appUserConnectorOAuthFailed", connectorId, reason },
        window.location.origin,
      );
    };

    if (params.get("success") !== "true") {
      fail(params.get("error") ?? "Google did not complete the sign-in.");
      window.close();
      return;
    }

    const code = params.get("code");
    if (!code) {
      fail(
        params.get("offline_access_allowed") === "false"
          ? "This app cannot keep the connection yet. An owner has to allow offline access first."
          : "Google finished without a code to exchange.",
      );
      return;
    }

    // A main window is waiting: hand it the one-time code and let it finish.
    // The code is a single-use handle, never a credential — the exchange still
    // happens on the server, and the key never touches any window.
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: "appUserConnectorOAuthRelay", connectorId, code },
        window.location.origin,
      );
      const fallback = window.setTimeout(() => {
        setMessage("Still finishing… if nothing happens, close this window and tap Connect again.");
      }, 8000);
      return () => window.clearTimeout(fallback);
    }

    // No main window to lean on (opened directly): finish here.
    const orgId = sessionStorage.getItem("metro-echo:google-calendar-org") || null;
    void supabase.functions
      .invoke("app-user-oauth-complete", { body: { code, organization_id: orgId } })
      .then(({ error }) => {
        if (error) throw error;
        setMessage("Connected. You can close this window.");
        tell(connectorId, "appUserConnectorOAuthComplete");
        window.close();
      })
      .catch(async (err) => {
        const detail = await readInvokeError(err);
        fail(detail ? `Could not finish the connection. (${detail})` : "Could not finish the connection.");
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </main>
  );
}

function tell(connectorId: string, type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") {
  window.opener?.postMessage({ type, connectorId }, window.location.origin);
}
