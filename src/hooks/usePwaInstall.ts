import { useCallback, useEffect, useState } from "react";
import { detectInstallPlatform, isStandalonePwa, type InstallPlatform } from "@/lib/pwaInstall";

// Chrome's BeforeInstallPromptEvent isn't in the standard lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PromptResult = "accepted" | "dismissed" | "unavailable";

export function usePwaInstall() {
  const [platform, setPlatform] = useState<InstallPlatform>("unknown");
  const [standalone, setStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectInstallPlatform());
    setStandalone(isStandalonePwa());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    const mm = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => setStandalone(isStandalonePwa());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mm?.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mm?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptResult> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  return {
    platform,
    standalone,
    installed: installed || standalone,
    canPrompt: !!deferredPrompt,
    promptInstall,
  };
}
