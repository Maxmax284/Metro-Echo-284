// pushClient — minimal Web Push subscription helper.
// Doctrine: opt-in only, on explicit user tap. Receipts via audit_log.
import { supabase } from "@/integrations/supabase/client";

export type PushStatus =
  | "unsupported"
  | "blocked"
  | "off"          // permission default, no subscription
  | "needs-config" // VAPID not configured on server
  | "ready";       // subscribed and stored

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("push-config", {
    body: { action: "get_public_key" },
  });
  if (error) return null;
  return (data as any)?.public_key ?? null;
}

/**
 * Subscribing a device IS consent to be buzzed — the channel toggle in
 * Settings has to say the same thing, or the screen and the rail disagree.
 * Best-effort: a failed pref write never undoes a working subscription.
 */
async function writePushOptIn(userId: string, on: boolean): Promise<void> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = {
      ...((data?.preferences as Record<string, unknown> | null) ?? {}),
      push_reminders_enabled: on,
    };
    await supabase.from("profiles").update({ preferences: prefs }).eq("id", userId);
  } catch {
    // the subscription stands; the toggle can be set by hand
  }
}

/**
 * The worker belongs to the real published address only. In a preview frame or
 * a dev host it would bind Metro Echo to a throwaway origin — which is exactly
 * how an installed shortcut ends up pointing at the wrong address. In those
 * contexts we refuse and clear anything already registered. `?sw=off` is the
 * manual kill switch.
 */
export function swAllowedHere(): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  if (new URLSearchParams(window.location.search).has("sw")) return false;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return false;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return false;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return false;
  return true;
}

async function unregisterHere(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || "").endsWith("/sw.js"))
        .map((r) => r.unregister()),
    );
  } catch {
    // nothing to clean up
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!swAllowedHere()) {
    await unregisterHere();
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return "ready";
  return "off";
}

export type PushDiagnostics = {
  permission: NotificationPermission | "unsupported";
  swRegistered: boolean;
  subscriptionLocal: boolean;
  subscriptionStored: boolean;
  vapidConfigured: boolean;
  staleSubscription: boolean;
  failureCount: number;
  lastError: string | null;
  lastDeliveryAt: string | null;
  endpoint: string | null;
  allGreen: boolean;
};

export async function getDiagnostics(): Promise<PushDiagnostics> {
  const base: PushDiagnostics = {
    permission: "unsupported",
    swRegistered: false,
    subscriptionLocal: false,
    subscriptionStored: false,
    vapidConfigured: false,
    staleSubscription: false,
    failureCount: 0,
    lastError: null,
    lastDeliveryAt: null,
    endpoint: null,
    allGreen: false,
  };
  if (!pushSupported()) return base;
  base.permission = Notification.permission;

  const reg = await navigator.serviceWorker.getRegistration("/");
  base.swRegistered = !!reg;
  const sub = await reg?.pushManager.getSubscription();
  base.subscriptionLocal = !!sub;
  base.endpoint = sub?.endpoint ?? null;

  const { data, error } = await supabase.functions.invoke("push-diagnose", {
    body: { endpoint: base.endpoint },
  });
  if (!error && data) {
    const d = data as any;
    base.vapidConfigured = !!d.vapidConfigured;
    base.subscriptionStored = !!d.subscriptionStored;
    base.staleSubscription = !!d.staleSubscription;
    base.failureCount = d.failureCount ?? 0;
    base.lastError = d.lastError ?? null;
    base.lastDeliveryAt = d.lastDeliveryAt ?? null;
  }
  base.allGreen =
    base.permission === "granted" &&
    base.swRegistered &&
    base.subscriptionLocal &&
    base.subscriptionStored &&
    base.vapidConfigured &&
    !base.staleSubscription;
  return base;
}

export async function subscribeToPush(userId: string): Promise<{
  ok: boolean;
  status: PushStatus;
  error?: string;
}> {
  if (!pushSupported()) return { ok: false, status: "unsupported" };

  // Permission gate
  const perm = await Notification.requestPermission();
  if (perm === "denied") return { ok: false, status: "blocked" };
  if (perm !== "granted") return { ok: false, status: "off" };

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, status: "needs-config", error: "VAPID not configured" };

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) return { ok: false, status: "unsupported", error: "Service worker failed" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  }

  const json: any = sub.toJSON();
  const p256dh = json?.keys?.p256dh;
  const auth = json?.keys?.auth;
  if (!p256dh || !auth) return { ok: false, status: "off", error: "Invalid subscription keys" };

  const { error: upErr } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 240),
        failure_count: 0,
        last_error: null,
        last_used_at: null,
      },
      { onConflict: "endpoint" },
    );
  if (upErr) return { ok: false, status: "ready", error: upErr.message };

  await writePushOptIn(userId, true);

  await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "push",
    event: "push.subscribed",
    payload: { endpoint_host: new URL(sub.endpoint).host },
  });

  return { ok: true, status: "ready" };
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
    await writePushOptIn(userId, false);
    await supabase.from("audit_log").insert({
      user_id: userId,
      entity_type: "push",
      event: "push.unsubscribed",
      payload: {},
    });
  }
}
