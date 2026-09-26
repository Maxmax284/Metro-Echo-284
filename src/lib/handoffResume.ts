// handoffResume — one companion, several bodies.
//
// Start on the phone, continue at the desk, and Echo should already know it is
// the same thread of work. This module decides whether saying so is helpful,
// and what may travel.
//
// Hard rules, none of them negotiable:
//   - context never crosses scope. A different scope means no resume, full stop.
//   - approval never carries. A pending action travels as a POINTER only; the
//     yes has to happen on the body you are holding.
//   - transient device facts stay on their device (posture-adjacent sensors,
//     movement, earbuds, quiet hours, device class).
//   - stale context stays quiet. Old is not helpful, it is noise.
//
// Pure module. No IO, no clock beyond the `now` you pass in.

import type { StoredContext } from "@/lib/awareness";
import { DEVICE_LABEL } from "@/lib/deviceClass";
import type { DeviceClass, VantaContext } from "@/lib/awareness";

/** Fields that must never be written to the durable slice. */
export const NEVER_CARRIED = [
  "deviceClass",
  "moving",
  "quietHours",
  "earbudsPresent",
  "wearablePresent",
  "locationLabel",
] as const;

/** Strip the device-local half so only the travelling half persists. */
export function carryable(ctx: VantaContext): VantaContext {
  const out: VantaContext = { ...ctx };
  for (const k of NEVER_CARRIED) delete (out as Record<string, unknown>)[k];
  return out;
}

/** Below this, you are still in the same sitting — nothing to announce. */
export const MIN_GAP_MS = 3 * 60_000;
/** Above this, the thread is cold. Receipts and Work carry it, not a nudge. */
export const MAX_GAP_MS = 12 * 60 * 60_000;

export type ResumeNotice = {
  /** "You were on Lamai rollout 18 minutes ago on your phone." */
  line: string;
  /** "Last step: reviewed booking drift." Omitted when nothing was recorded. */
  step: string | null;
  /** Where Resume goes. Never executes anything. */
  surface: string;
  /** Anchor ids, for the surface to open the right record. */
  projectId: string | null;
  threadId: string | null;
  /** Present when an approval is still open. It is a pointer, never consent. */
  pendingActionId: string | null;
  /** The stable key used to remember a dismissal. */
  key: string;
};

function agoWords(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

function deviceWords(d: DeviceClass | null | undefined): string | null {
  if (!d || d === "unknown") return null;
  const label = DEVICE_LABEL[d].toLowerCase();
  if (d === "desk") return "at your desk";
  if (d === "vehicle") return "in a vehicle";
  return `on your ${label}`;
}

/**
 * The resume line, or null when staying quiet is the right answer.
 *
 * Returns null when: scope differs, the anchor is missing, the gap is too short
 * or too long, the last body is the current body, or quiet hours are on.
 */
export function resumeNotice(input: {
  stored: StoredContext;
  /** Scope key of the CURRENT session. Must match what was stored. */
  scopeKey: string;
  /** The body the user is holding right now. */
  deviceClass: DeviceClass;
  quietHours?: boolean;
  now?: number;
}): ResumeNotice | null {
  const { stored, scopeKey, deviceClass } = input;
  const now = input.now ?? Date.now();

  if (input.quietHours) return null;
  // Scope isolation: an unknown or mismatched scope key never resumes.
  if (!stored.lastScopeKey || stored.lastScopeKey !== scopeKey) return null;

  const seen = stored.lastSeenAt ? Date.parse(stored.lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return null;
  const gap = now - seen;
  if (gap < MIN_GAP_MS || gap > MAX_GAP_MS) return null;

  const from = stored.lastDeviceClass ?? null;
  if (!from || from === "unknown" || from === deviceClass) return null;

  const anchorLabel = stored.lastAnchorLabel ?? null;
  const projectId = stored.projectId ?? null;
  const threadId = stored.threadId ?? null;
  if (!anchorLabel && !projectId && !threadId) return null;

  const where = deviceWords(from);
  const subject = anchorLabel ?? (threadId ? "a thread with Echo" : "open work");
  const line = `You were on ${subject} ${agoWords(gap)}${where ? ` ${where}` : ""}.`;

  return {
    line,
    step: stored.lastStep ? `Last step: ${stored.lastStep}` : null,
    surface: stored.lastAnchorSurface ?? (threadId ? "ask" : "work"),
    projectId,
    threadId,
    pendingActionId: stored.pendingActionId ?? null,
    key: `${stored.lastScopeKey}:${stored.lastSeenAt}`,
  };
}

/** Shown under the notice when an approval is still open on another body. */
export const APPROVAL_NEVER_CARRIES =
  "An approval is still open. You will have to say yes here — it does not travel with you.";
