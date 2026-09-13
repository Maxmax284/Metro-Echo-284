// The small window Google sends you back to, for any one Google service.
//
// It holds a one-time code, hands it to the backend, and says one true thing
// before closing. It never sees a token and never claims success early.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function GoogleReturn() {
  const [message, setMessage] = useState("Finishing the connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectorId = params.get("service")
      || sessionStorage.getItem("metro-echo:google-service")
      || "google_calendar";

    const tell = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      reason?: string,
    ) => {
      window.opener?.postMessage({ type, connectorId, reason }, window.location.origin);
    };

    if (params.get("success") !== "true") {
      const reason = params.get("error") ?? "Google did not complete the sign-in.";
      setMessage(reason);
      tell("appUserConnectorOAuthFailed", reason);
      window.close();
      return;
    }

    const code = params.get("code");
    if (!code) {
      const reason = params.get("offline_access_allowed") === "false"
        ? "This app cannot keep the connection yet. An owner has to allow offline access first."
        : "Google finished without a code to exchange.";
      setMessage(reason);
      tell("appUserConnectorOAuthFailed", reason);
      return;
    }

    const orgId = sessionStorage.getItem("metro-echo:google-calendar-org") || null;
    void supabase.functions
      .invoke("app-user-oauth-complete", { body: { code, organization_id: orgId } })
      .then(({ error }) => {
        if (error) throw error;
        setMessage("Connected. You can close this window.");
        tell("appUserConnectorOAuthComplete");
        window.close();
      })
      .catch(() => {
        const reason = "Could not finish the connection.";
        setMessage(reason);
        tell("appUserConnectorOAuthFailed", reason);
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </main>
  );
}
