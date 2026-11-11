// appSw — the one registrar for the app-shell service worker (/app-sw.js).
//
// The push worker (/sw.js) is a separate registration and is never touched
// here. The app-shell worker precaches the build so the rooms open with no
// signal; it only ever registers on the real published app — never in dev,
// never in a Lovable preview, never inside an iframe, and ?sw=off is the
// kill switch. In any refused context, a stale app-shell registration is
// unregistered instead.

const APP_SW_PATH = "/app-sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname.toLowerCase();
  const firstLabel = host.split(".")[0];
  const lovableHost =
    host.endsWith(".lovable.app") || host.endsWith(".gpt-eng.com") || host.endsWith(".gptengineer.run");
  if (lovableHost && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(firstLabel)) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).has("sw", "off")) return true;
  return false;
}

async function unregisterStaleAppSw(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    const script = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? reg.installing?.scriptURL ?? "";
    if (script.endsWith(APP_SW_PATH)) await reg.unregister();
  }
}

export function registerAppServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    void unregisterStaleAppSw();
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(APP_SW_PATH, { scope: "/" });
  });
}
