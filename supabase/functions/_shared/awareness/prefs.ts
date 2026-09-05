// Context preferences — the durable half of VantaContext.
//
// The context object itself (context.ts) is in-memory and cross-device. This
// module reads/writes the part that must SURVIVE a device switch: the posture
// the user set by hand, the situational lens, the open thread, and which
// senses the user has consented to.
//
// Pure module. No IO. Mirrored into the client so server and UI agree on one
// definition of "is Echo allowed to speak right now".
import type { IdentityLens, Posture, PostureSource, VantaContext, DeviceClass } from "./context.ts";
import { POSTURES, postureHoldsNoise } from "./context.ts";
import type { Urgency } from "./urgency.ts";

/** Each sense is consented to separately. Absent = off, never assumed on. */
export const SENSORS = [
  "calendar",
  "location",
  "microphone",
  "posture_inference",
  "device_class",
  "heart_rate",
  "activity",
] as const;
export type SensorKey = (typeof SENSORS)[number];

export const SENSOR_LABEL: Record<SensorKey, string> = {
  calendar: "Calendar shape",
  location: "Coarse location",
  microphone: "Microphone",
  posture_inference: "Posture suggestions",
  device_class: "Which device you're on",
  heart_rate: "Heart rate",
  activity: "Steps, sleep and workouts",
};

export const SENSOR_DETAIL: Record<SensorKey, string> = {
  calendar: "Read-only. Echo can see the shape of your day; it can never move or reply to anything.",
  location: "City-level only, used for timing and travel context. Never a live trail.",
  microphone: "Only while you hold record for a voice note. Nothing listens in the background.",
  posture_inference: "Echo may suggest a posture. It never switches one on by itself.",
  device_class: "Lets Echo say less on a phone or watch than it does at a desk.",
  heart_rate: "Only while you hold a Bluetooth connection open on the Wearables page. Nothing runs in the background.",
  activity: "Daily numbers your phone sends over — steps, sleep, workouts. Echo never pulls them on its own.",
};

/** The persisted slice, stored under `profiles.preferences.context`. */
export type StoredContext = {
  posture?: Posture | null;
  postureSource?: PostureSource | null;
  /** ISO time the manual posture stops applying. Nothing sticks forever. */
  postureUntil?: string | null;
  lens?: IdentityLens | null;
  projectId?: string | null;
  threadId?: string | null;
  unresolvedQuestion?: string | null;
  pendingActionId?: string | null;
  lastDeviceClass?: DeviceClass | null;
  lastSeenAt?: string | null;
  /** Resume anchor. A pointer back to work, never an approval. */
  lastStep?: string | null;
  lastAnchorLabel?: string | null;
  lastAnchorSurface?: string | null;
  /** The scope the anchor belongs to. Context never crosses scopes. */
  lastScopeKey?: string | null;
};


export const EMPTY_STORED: StoredContext = {};

function asPosture(v: unknown): Posture | null {
  return typeof v === "string" && (POSTURES as string[]).includes(v) ? (v as Posture) : null;
}

/** Read the stored slice out of a raw preferences blob, defensively. */
export function readStoredContext(prefs: Record<string, unknown> | null | undefined): StoredContext {
  const raw = (prefs ?? {})["context"];
  if (!raw || typeof raw !== "object") return EMPTY_STORED;
  const c = raw as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : null);
  return {
    posture: asPosture(c.posture),
    postureSource: (str("postureSource") as PostureSource | null) ?? null,
    postureUntil: str("postureUntil"),
    lens: (str("lens") as IdentityLens | null) ?? null,
    projectId: str("projectId"),
    threadId: str("threadId"),
    unresolvedQuestion: str("unresolvedQuestion"),
    pendingActionId: str("pendingActionId"),
    lastDeviceClass: (str("lastDeviceClass") as DeviceClass | null) ?? null,
    lastSeenAt: str("lastSeenAt"),
    lastStep: str("lastStep"),
    lastAnchorLabel: str("lastAnchorLabel"),
    lastAnchorSurface: str("lastAnchorSurface"),
    lastScopeKey: str("lastScopeKey"),
  };
}


/** A manual posture only counts while it hasn't expired. */
export function activePosture(stored: StoredContext, now = Date.now()): Posture | null {
  if (!stored.posture) return null;
  if (stored.postureUntil) {
    const until = new Date(stored.postureUntil).getTime();
    if (Number.isFinite(until) && until <= now) return null;
  }
  return stored.posture;
}

/** Consent lookup. Missing means off — silence is the safe default. */
export function sensorAllowed(
  prefs: Record<string, unknown> | null | undefined,
  sensor: SensorKey,
): boolean {
  const raw = (prefs ?? {})["sensor_consent"];
  if (!raw || typeof raw !== "object") return false;
  return (raw as Record<string, unknown>)[sensor] === true;
}

/**
 * Should this urgency be held because of the posture the user set?
 * `critical` is never held — a posture is a courtesy, not a gag.
 */
export function postureHolds(
  prefs: Record<string, unknown> | null | undefined,
  urgency: Urgency,
  now = Date.now(),
): boolean {
  if (urgency === "critical") return false;
  const posture = activePosture(readStoredContext(prefs), now);
  return postureHoldsNoise(posture ?? undefined);
}

/** Fold the stored slice into a live context object. */
export function contextFromStored(stored: StoredContext, now = Date.now()): VantaContext {
  const posture = activePosture(stored, now);
  return {
    posture: posture ?? undefined,
    postureSource: posture ? (stored.postureSource ?? "manual") : undefined,
    lens: stored.lens ?? undefined,
    projectId: stored.projectId ?? null,
    threadId: stored.threadId ?? null,
    unresolvedQuestion: stored.unresolvedQuestion ?? null,
    pendingActionId: stored.pendingActionId ?? null,
    lastDeviceClass: stored.lastDeviceClass ?? undefined,
    lastSeenAt: stored.lastSeenAt ?? null,
    lastStep: stored.lastStep ?? null,
    lastAnchorLabel: stored.lastAnchorLabel ?? null,
    lastAnchorSurface: stored.lastAnchorSurface ?? null,
  };
}

/** The inverse: what we persist after a local change. */
export function storedFromContext(
  ctx: VantaContext,
  postureUntil?: string | null,
  scopeKey?: string | null,
): StoredContext {
  return {
    posture: ctx.posture ?? null,
    postureSource: ctx.postureSource ?? null,
    postureUntil: ctx.posture ? (postureUntil ?? null) : null,
    lens: ctx.lens ?? null,
    projectId: ctx.projectId ?? null,
    threadId: ctx.threadId ?? null,
    unresolvedQuestion: ctx.unresolvedQuestion ?? null,
    pendingActionId: ctx.pendingActionId ?? null,
    lastDeviceClass: ctx.deviceClass ?? ctx.lastDeviceClass ?? null,
    lastSeenAt: new Date().toISOString(),
    lastStep: ctx.lastStep ?? null,
    lastAnchorLabel: ctx.lastAnchorLabel ?? null,
    lastAnchorSurface: ctx.lastAnchorSurface ?? null,
    lastScopeKey: scopeKey ?? null,
  };

}
