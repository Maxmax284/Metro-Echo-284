// VantaContext — the cross-device context object.
//
// One Vanta core, multiple bodies. Every surface (desk, phone, messaging,
// wearable, earbuds) describes the moment with this same shape so no device
// grows its own memory silo. Every field is optional on purpose: the
// architecture must degrade gracefully when the moment is unknown, and an
// unknown field NEVER becomes an assumption.
//
// Declared now, deliberately unused by UI. Nothing here changes behaviour; it
// exists so future senses have a place to land instead of being bolted on.
//
// Pure module. No IO. Safe to mirror into the client.

/** Where the user is interacting from. */
export type DeviceClass = "desk" | "phone" | "tablet" | "wearable" | "earbuds" | "vehicle" | "ambient" | "unknown";

/**
 * What KIND of moment this is. Manual activation first; automatic inference
 * only ever with explicit permission and strong confidence, and Vanta prefers
 * suggesting a posture over silently assuming one.
 */
export type Posture =
  | "at_desk"
  | "deep_work"
  | "meeting"
  | "training"
  | "driving"
  | "travel"
  | "moving"
  | "quiet"
  | "sleep";

export const POSTURES: Posture[] = [
  "at_desk",
  "deep_work",
  "meeting",
  "training",
  "driving",
  "travel",
  "moving",
  "quiet",
  "sleep",
];

export const POSTURE_LABEL: Record<Posture, string> = {
  at_desk: "At desk",
  deep_work: "Deep work",
  meeting: "Meeting",
  training: "Training",
  driving: "Driving",
  travel: "Travel",
  moving: "Out and moving",
  quiet: "Quiet",
  sleep: "Sleep",
};

/**
 * A situational priority lens. NOT an account, NOT a permission. Scope stays
 * the hard security boundary underneath; a lens only reorders what surfaces
 * first within what the user may already see.
 */
export type IdentityLens = "personal" | "operator" | "trainer" | "developer" | "owner";

/** How a posture was arrived at. Inference must always be visible. */
export type PostureSource = "manual" | "suggested" | "inferred" | "unknown";

export type VantaContext = {
  /** Hard boundary. Never inferred, never merged. */
  scope?: { userId: string; organizationId: string | null };
  /** What the user is working on right now. */
  projectId?: string | null;
  /** The open Ask thread, so it can travel between devices. */
  threadId?: string | null;
  /** The question Vanta has not answered yet. */
  unresolvedQuestion?: string | null;
  /** Records the current thread is grounded in. */
  sourceRefs?: { kind: string; id: string; label?: string }[];
  /** An approval waiting on the human. Never auto-resolved by a device switch. */
  /** An approval waiting on the human. Never auto-resolved by a device switch. */
  pendingActionId?: string | null;

  /**
   * Cross-device resume anchor. Written when the user does something meaningful
   * on one body so another body can say "you were here". Never an approval, and
   * never enough on its own to change state.
   */
  lastStep?: string | null;
  /** Human label for the project/object the last step touched. */
  lastAnchorLabel?: string | null;
  /** Where the last step happened, so the resume line can point back. */
  lastAnchorSurface?: string | null;


  deviceClass?: DeviceClass;
  lastDeviceClass?: DeviceClass;
  lastChannel?: string | null;
  lastSeenAt?: string | null;

  posture?: Posture;
  postureSource?: PostureSource;
  lens?: IdentityLens;

  /** Coarse only, and only when explicitly enabled. */
  locationLabel?: string | null;
  moving?: boolean;
  quietHours?: boolean;
  earbudsPresent?: boolean;
  wearablePresent?: boolean;
};

export const EMPTY_CONTEXT: VantaContext = {};

/**
 * Merge an update into a context. Later values win, but `undefined` never
 * erases what is already known — an unaware device must not blank the thread
 * a knowing device established.
 */
export function mergeContext(base: VantaContext, update: VantaContext): VantaContext {
  const out: VantaContext = { ...base };
  for (const [k, v] of Object.entries(update)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Moving to another body keeps the thread and remembers where we came from. */
export function handoff(ctx: VantaContext, to: DeviceClass): VantaContext {
  return mergeContext(ctx, { lastDeviceClass: ctx.deviceClass ?? "unknown", deviceClass: to });
}

/**
 * Postures that hold non-urgent communication. This is a suppression HINT for
 * the central judgment layer — it is not a delivery decision, and it can never
 * silence `critical`.
 */
const HOLDS_NOISE: Posture[] = ["deep_work", "training", "driving", "meeting", "sleep", "quiet"];

export function postureHoldsNoise(posture?: Posture): boolean {
  return posture ? HOLDS_NOISE.includes(posture) : false;
}

/** Sleep is near-total silence; driving is voice-first and never approval-heavy. */
export function postureAllowsInteraction(posture: Posture | undefined, kind: "approval" | "read" | "voice"): boolean {
  if (posture === "sleep") return false;
  if (posture === "driving") return kind === "voice";
  if (posture === "training" && kind === "approval") return false;
  return true;
}

/** Human line for receipts and for "why did you hold that?" answers. */
export function describeContext(ctx: VantaContext): string {
  const bits: string[] = [];
  if (ctx.posture) bits.push(POSTURE_LABEL[ctx.posture]);
  if (ctx.deviceClass && ctx.deviceClass !== "unknown") bits.push(`on ${ctx.deviceClass}`);
  if (ctx.locationLabel) bits.push(ctx.locationLabel);
  if (ctx.quietHours) bits.push("quiet hours");
  return bits.length ? bits.join(" · ") : "no context set";
}
