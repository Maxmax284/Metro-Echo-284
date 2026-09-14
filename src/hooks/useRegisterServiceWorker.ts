import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pushClient";

/**
 * Register the Metro Echo service worker on startup in production.
 * This is what lets Chrome fire the beforeinstallprompt event and makes
 * the Android one-tap install button actually appear. In dev/preview we
 * refuse, so this hook is a no-op there.
 */
export function useRegisterServiceWorker() {
  useEffect(() => {
    let ignore = false;
    registerServiceWorker().then(() => {
      if (ignore) return;
      // We don't need to hold the registration; the browser keeps it.
    });
    return () => {
      ignore = true;
    };
  }, []);
}
