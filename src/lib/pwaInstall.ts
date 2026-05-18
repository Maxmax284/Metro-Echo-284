// Platform detection + installed-state checks for the Vanta PWA install flow.
// Keep all install-related decisions isolated here so future native wrappers
// (Capacitor, desktop shell, etc.) can plug in without touching UI code.

export type InstallPlatform =
  | "android-chromium"
  | "android-other"
  | "ios-safari"
  | "ios-other"
  | "desktop-chromium"
  | "desktop-other"
  | "unknown";

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (window.navigator as any).standalone === true;
  return Boolean(mm || iosStandalone);
}

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isChromium = /Chrome|CriOS|Chromium|Edg|EdgiOS/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !isChromium;

  if (isAndroid) return isChromium ? "android-chromium" : "android-other";
  if (isIOS) return isSafari ? "ios-safari" : "ios-other";
  if (isChromium) return "desktop-chromium";
  return "desktop-other";
}

export function isMobilePlatform(p: InstallPlatform): boolean {
  return p === "android-chromium" || p === "android-other" || p === "ios-safari" || p === "ios-other";
}
