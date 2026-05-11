// Thin wrappers around Capacitor plugins. All calls are guarded so the web
// build keeps working — native plugins are only invoked when running inside
// a Capacitor shell.
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

export async function getCurrentPosition(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (isNative()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") return null;
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    }
    if ("geolocation" in navigator) {
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => resolve(null),
          { timeout: 8000 }
        );
      });
    }
  } catch { /* ignore */ }
  return null;
}

export async function shareText(text: string, title?: string) {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text, title });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ text, title });
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function scheduleLocalNotification(opts: { title: string; body: string; at?: Date; id?: number }) {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [{
        id: opts.id ?? Math.floor(Math.random() * 1_000_000),
        title: opts.title,
        body: opts.body,
        schedule: opts.at ? { at: opts.at } : undefined,
      }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function registerPushIfNative(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return null;
    return await new Promise((resolve) => {
      PushNotifications.addListener("registration", (t) => resolve(t.value));
      PushNotifications.addListener("registrationError", () => resolve(null));
      PushNotifications.register();
      setTimeout(() => resolve(null), 6000);
    });
  } catch {
    return null;
  }
}
