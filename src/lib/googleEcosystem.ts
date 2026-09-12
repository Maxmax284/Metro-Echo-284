// googleEcosystem — Google as ONE account in the UI, with each service kept as
// its own explicit permission underneath.
//
// Rules this file exists to enforce:
//  - Signing in never means "Echo can see everything Google holds".
//  - A service is only ever shown as available for connecting when the wiring
//    behind it actually exists. Nothing here fakes support.
//  - Calendar is the first real capability. The rest declare exactly what they
//    would need, so adding one is a wiring job, not a new mini-integration.
//
// Pure data + pure helpers. No IO.

import type { ReachState } from "@/lib/reach";
import type { Authority } from "@/lib/reach";

export type GoogleCapabilityKey = "calendar" | "gmail" | "drive" | "contacts" | "tasks";

export type GoogleCapability = {
  key: GoogleCapabilityKey;
  label: string;
  /** What Echo would do with it, in a person's words. */
  what: string;
  /** The exact Google permissions this capability asks for. */
  scopes: string[];
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
    what: "Reads your real calendar, and moves or adds an entry once you approve the exact change.",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    authority: "act",
    wired: true,
  },
  {
    key: "gmail",
    label: "Gmail",
    what: "Would read the mail that matters and prepare replies for you to approve.",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    authority: "prepare",
    wired: false,
    blocker: "Mail reading is not built yet. Forwarding to your Echo address already works today.",
  },
  {
    key: "drive",
    label: "Drive",
    what: "Would read documents you point it at and pull them into a project.",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    authority: "see",
    wired: false,
    blocker: "Drive reading is not built yet. Uploading or sending a file already works today.",
  },
  {
    key: "contacts",
    label: "Contacts",
    what: "Would match names to real people so guests and invites stop being guesswork.",
    scopes: ["https://www.googleapis.com/auth/contacts.readonly"],
    authority: "see",
    wired: false,
    blocker: "Contacts lookup is not built yet. You can type an email address instead.",
  },
  {
    key: "tasks",
    label: "Tasks",
    what: "Would keep your Google task list and your promises here in step.",
    scopes: ["https://www.googleapis.com/auth/tasks"],
    authority: "prepare",
    wired: false,
    blocker: "Task syncing is not built yet. Promises live in Metro Echo for now.",
  },
];

export type GoogleAccountState = {
  /** True when this person signed in with their own Google account. */
  signedIn: boolean;
  /** The account label, when Echo recorded one. */
  account: string | null;
  /** Capability keys that are actually granted and working right now. */
  granted: GoogleCapabilityKey[];
  /** A capability that was working and has now stopped. */
  failing?: GoogleCapabilityKey[];
};

/** One word for a single Google service. */
export function capabilityReach(cap: GoogleCapability, state: GoogleAccountState): ReachState {
  if (state.failing?.includes(cap.key)) return "needs_you";
  if (state.signedIn && state.granted.includes(cap.key)) return "connected";
  return "available";
}

/** One word for the whole Google account container. */
export function accountReach(state: GoogleAccountState): ReachState {
  if (state.failing && state.failing.length > 0) return "needs_you";
  return state.signedIn && state.granted.length > 0 ? "connected" : "available";
}

/** The honest headline under the account name. Never promises unbuilt services. */
export function accountLine(state: GoogleAccountState): string {
  if (!state.signedIn) {
    return "Sign in once and pick what Echo may touch. Signing in on its own gives Echo nothing.";
  }
  const on = GOOGLE_CAPABILITIES.filter((c) => state.granted.includes(c.key)).map((c) => c.label);
  if (on.length === 0) return "Signed in. No Google service is switched on yet.";
  return `${on.join(" and ")} ${on.length === 1 ? "is" : "are"} switched on. Nothing else in your Google account is readable.`;
}

/** Services that could genuinely be added right now. */
export function addableCapabilities(state: GoogleAccountState): GoogleCapability[] {
  return GOOGLE_CAPABILITIES.filter((c) => c.wired && !state.granted.includes(c.key));
}

/** Every permission Echo would hold after granting these capabilities. */
export function scopesFor(keys: GoogleCapabilityKey[]): string[] {
  const out = new Set<string>();
  for (const cap of GOOGLE_CAPABILITIES) {
    if (keys.includes(cap.key)) cap.scopes.forEach((s) => out.add(s));
  }
  return [...out];
}
