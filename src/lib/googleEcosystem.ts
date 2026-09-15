// googleEcosystem — Google as ONE account in the UI, with each service kept as
// its own explicit permission underneath.
//
// Rules this file exists to enforce:
//  - Signing in never means "Echo can see everything Google holds".
//  - A service is only ever shown as available for connecting when the wiring
//    behind it actually exists. Nothing here fakes support.
//  - Status is per service and comes from this person's own grants. The
//    builder's workspace connection keeps calendar reads working but may never
//    render as "you are connected".
//  - Contacts is deliberately absent: there is no supported route to it, and a
//    button that cannot work is worse than no button.
//
// Pure data + pure helpers. No IO.

import type { ReachState } from "@/lib/reach";
import type { Authority } from "@/lib/reach";
import type { GoogleConnectorId, GoogleServiceStatus } from "@/lib/googleServices";

export type GoogleCapabilityKey = "calendar" | "gmail" | "drive" | "tasks";

export type GoogleCapability = {
  key: GoogleCapabilityKey;
  label: string;
  /** The connector behind it, when there is one. */
  connectorId: GoogleConnectorId | null;
  /** What Echo would do with it, in a person's words. */
  what: string;
  /** How far Echo's authority reaches for this service. */
  authority: Authority;
  /** True only when the calls behind it are actually implemented. */
  wired: boolean;
  /** When not wired, the honest reason. */
  blocker?: string;
};

export const GOOGLE_CAPABILITIES: GoogleCapability[] = [
  {
    key: "calendar",
    label: "Calendar",
    connectorId: "google_calendar",
    what: "Reads your real calendar, and moves or adds an entry once you approve the exact change.",
    authority: "act",
    wired: true,
  },
  {
    key: "gmail",
    label: "Gmail",
    connectorId: "google_mail",
    what:
      "Reads the mail that is waiting on you and opens a reply you write yourself. Sending is a separate yes, every time.",
    authority: "act",
    wired: true,
  },
  {
    key: "drive",
    label: "Drive",
    connectorId: "google_drive",
    what:
      "Finds a file by name. Reading what is inside one is a separate yes for that file, and it is recorded.",
    authority: "see",
    wired: true,
  },
  {
    key: "tasks",
    label: "Tasks",
    connectorId: null,
    what: "Would keep your Google task list and your promises here in step.",
    authority: "prepare",
    wired: false,
    blocker: "Task syncing is not built yet. Promises live in Metro Echo for now.",
  },
];

export type GoogleAccountState = {
  /** True when this person granted at least one Google service themselves. */
  signedIn: boolean;
  /** The account label, when Echo recorded one. */
  account: string | null;
  /** Per-service truth, straight from the backend. */
  services: Record<GoogleConnectorId, GoogleServiceStatus | undefined>;
};

export const EMPTY_GOOGLE_STATE: GoogleAccountState = {
  signedIn: false,
  account: null,
  services: { google_calendar: undefined, google_mail: undefined, google_drive: undefined },
};

export function googleStateFrom(input: {
  signedIn: boolean;
  account: string | null;
  services: GoogleServiceStatus[];
}): GoogleAccountState {
  const map = { ...EMPTY_GOOGLE_STATE.services };
  for (const s of input.services) map[s.service] = s;
  return { signedIn: input.signedIn, account: input.account, services: map };
}

export function statusFor(
  cap: GoogleCapability,
  state: GoogleAccountState,
): GoogleServiceStatus | undefined {
  return cap.connectorId ? state.services[cap.connectorId] : undefined;
}

export function isGranted(cap: GoogleCapability, state: GoogleAccountState): boolean {
  return !!statusFor(cap, state)?.connected;
}

/** True when Echo can genuinely use this service now, however it was granted. */
export function isWorking(cap: GoogleCapability, state: GoogleAccountState): boolean {
  const status = statusFor(cap, state);
  return !!(status?.working ?? status?.connected);
}

/** True when the service works through this app's shared Google link, not your sign-in. */
export function isSharedGrant(cap: GoogleCapability, state: GoogleAccountState): boolean {
  const status = statusFor(cap, state);
  return status?.via === "app";
}

/** One word for a single Google service. */
export function capabilityReach(cap: GoogleCapability, state: GoogleAccountState): ReachState {
  const status = statusFor(cap, state);
  if (status?.failing) return "needs_you";
  if (isWorking(cap, state)) return "connected";
  return "available";
}

/** Why a service reads without this person having signed in for it. */
export function sharedGrantLine(cap: GoogleCapability, state: GoogleAccountState): string | null {
  if (!isSharedGrant(cap, state)) return null;
  return `Echo already reads your ${cap.label.toLowerCase()} through this app's own Google link. Sign in yourself to put it on your account.`;
}

/** One word for the whole Google account container. */
export function accountReach(state: GoogleAccountState): ReachState {
  const all = Object.values(state.services).filter(Boolean) as GoogleServiceStatus[];
  if (all.some((s) => s.failing)) return "needs_you";
  return all.some((s) => s.working ?? s.connected) ? "connected" : "available";
}

/** The honest headline under the account name. Never promises unbuilt services. */
export function accountLine(state: GoogleAccountState): string {
  const on = GOOGLE_CAPABILITIES.filter((c) => isWorking(c, state)).map((c) => c.label);
  if (on.length === 0) {
    return "Sign in once and pick what Echo may touch. Signing in on its own gives Echo nothing.";
  }
  return `${on.join(" and ")} ${on.length === 1 ? "is" : "are"} switched on. Nothing else in your Google account is readable.`;
}

/** Services this person could genuinely switch on right now. */
export function addableCapabilities(state: GoogleAccountState): GoogleCapability[] {
  return GOOGLE_CAPABILITIES.filter(
    (c) => c.wired && !!statusFor(c, state)?.offerable && !isGranted(c, state),
  );
}

/** Why a wired service still cannot be offered — an owner has to allow it. */
export function notOfferableLine(cap: GoogleCapability, state: GoogleAccountState): string | null {
  if (!cap.wired || isGranted(cap, state)) return null;
  if (statusFor(cap, state)?.offerable) return null;
  return `${cap.label} is built, but an owner has to allow it for this app before you can switch it on.`;
}
