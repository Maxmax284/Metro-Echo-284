// reach — one universal way to talk about what Echo can see, prepare, do and
// watch on any connection. This is a lens over the primitives that already
// exist (integration registry, connection states, source health, the action
// spine). It is not a second connection system: nothing here does IO, holds
// state, or routes events.
//
// Two doctrines live here.
//
// 1) User-facing connection state is only ever three words:
//      Connected  — working normally, with evidence behind it.
//      Available  — optional, not connected, nothing wrong. Never red.
//      Needs you  — something that was working (or is switched on and expected
//                   to work) now needs a person. Only this may be urgent.
//
// 2) Every source maps to the same capability contract:
//      See → Understand → Prepare → Act → Watch → Report
//    with two axes underneath:
//      Authority: see → prepare → act
//      Presence:  when I ask → keep an eye on it
//    Writing stays consequence-aware and approval-gated, always.

import type { ConnState } from "@/lib/connections";
import type { HealthState } from "@/lib/sourceHealth";
import type { IntegrationDef, IntegrationStatus } from "@/lib/integrations/registry";

/* ------------------------------------------------------------------- state */

export type ReachState = "connected" | "available" | "needs_you";

export const REACH_LABEL: Record<ReachState, string> = {
  connected: "Connected",
  available: "Available",
  needs_you: "Needs you",
};

/** What the word means, in one plain line. */
export const REACH_BLURB: Record<ReachState, string> = {
  connected: "Working normally.",
  available: "Not connected. Nothing is wrong.",
  needs_you: "This was set up and now needs you.",
};

/** Tone only. Red belongs to Needs you and nothing else. */
export const REACH_TONE: Record<ReachState, string> = {
  connected: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  available: "bg-muted/40 text-muted-foreground ring-border/60",
  needs_you: "bg-destructive/15 text-destructive ring-destructive/30",
};

export const REACH_LAMP: Record<ReachState, string> = {
  connected: "bg-emerald-400",
  available: "bg-muted-foreground/40",
  needs_you: "bg-destructive",
};

/** Collapse a connection card state into the three words. */
export function reachFromConn(state: ConnState): ReachState {
  switch (state) {
    case "connected":
    case "partial":
      return "connected";
    case "attention":
      return "needs_you";
    /* Never connected, switched off, or nothing has come through yet: all of
       those are choices or waiting, not failures. */
    case "needs_setup":
    case "off":
    case "no_data":
    default:
      return "available";
  }
}

/** Collapse a feed-health state into the three words. */
export function reachFromHealth(state: HealthState): ReachState {
  switch (state) {
    case "healthy":
    case "quiet":
      return "connected";
    /* "Late" and "attention" both mean something that was working stopped. */
    case "late":
    case "attention":
    case "missing_data":
      return "needs_you";
    default:
      return "available";
  }
}

/** Collapse the settings-page integration status into the three words. */
export function reachFromStatus(status: IntegrationStatus): ReachState {
  switch (status) {
    case "live":
    case "partial":
    case "configured":
      return "connected";
    case "blocked":
      return "needs_you";
    default:
      return "available";
  }
}

/**
 * Does this source genuinely need a person right now?
 *
 * Only true when the source is switched on / already in use AND something it
 * needs is missing. An optional integration nobody ever turned on is
 * "Available" and must never look broken.
 */
export function needsYou(input: {
  def: Pick<IntegrationDef, "bucket" | "expectedSecrets" | "killSwitchKey">;
  /** Kill switch value, when the source has one. */
  switchedOn: boolean | null;
  /** True when this source is actually in use (linked, receiving, etc.). */
  inUse: boolean;
  missingSecrets: string[];
  /** A recorded failure on the last attempt. */
  failing?: boolean;
}): boolean {
  if (input.failing) return true;
  if (input.missingSecrets.length === 0) return false;
  const expected = input.def.killSwitchKey ? input.switchedOn === true : input.inUse;
  return expected;
}

/* -------------------------------------------------------------- capability */

export type Authority = "see" | "prepare" | "act";
export type Presence = "on_ask" | "watching";

export type ReachContract = {
  /** Echo can read this source. */
  see: boolean;
  /** Echo can turn what it reads into meaning (situations, drafts, context). */
  understand: boolean;
  /** Echo can prepare a change without making it. */
  prepare: boolean;
  /** Echo can carry out an approved change. */
  act: boolean;
  /** Echo can keep an eye on it between asks. */
  watch: boolean;
  /** Every step lands in Receipts. */
  report: boolean;
  authority: Authority;
  presence: Presence;
};

/**
 * Read a source's contract off the registry entry it already has. Direction is
 * the source of truth: read-only sources never gain Act by accident.
 */
export function contractFor(
  def: Pick<IntegrationDef, "direction" | "outboundCallbacks" | "killSwitchKey">,
  opts: { connected: boolean; watching?: boolean } = { connected: false },
): ReachContract {
  const canAct = def.direction === "inbound_approved_outbound" && def.outboundCallbacks.length > 0;
  const canPrepare = canAct || def.direction === "read_only" || def.direction === "inbound";
  const see = def.direction !== "deferred";
  const watch = see && opts.connected && !!opts.watching;
  return {
    see,
    understand: see,
    prepare: see && canPrepare,
    act: canAct,
    watch,
    report: true,
    authority: canAct ? "act" : canPrepare ? "prepare" : "see",
    presence: watch ? "watching" : "on_ask",
  };
}

export const AUTHORITY_LINE: Record<Authority, string> = {
  see: "Echo can read this. It cannot change anything here.",
  prepare: "Echo can read this and prepare changes for you to approve.",
  act: "Echo can read this, prepare changes, and carry them out once you approve.",
};

export const PRESENCE_LINE: Record<Presence, string> = {
  on_ask: "Echo looks when you ask.",
  watching: "Echo keeps an eye on this and speaks only when something matters.",
};

/** The one-line human summary shown on a connection. Never backend nouns. */
export function contractSummary(c: ReachContract): string {
  return `${AUTHORITY_LINE[c.authority]} ${PRESENCE_LINE[c.presence]}`;
}

/** The six steps, in order, with only the ones this source really has. */
export function contractSteps(c: ReachContract): Array<{ key: string; label: string; on: boolean }> {
  return [
    { key: "see", label: "See", on: c.see },
    { key: "understand", label: "Understand", on: c.understand },
    { key: "prepare", label: "Prepare", on: c.prepare },
    { key: "act", label: "Act with approval", on: c.act },
    { key: "watch", label: "Keep an eye on it", on: c.watch },
    { key: "report", label: "Report in Receipts", on: c.report },
  ];
}
