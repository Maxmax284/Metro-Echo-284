// reachBody — which body Echo speaks through, and which one it stays off.
//
// Doctrine:
//   - The phone is the main surface. The desk is for deep work. The wrist is a
//     glance, an acknowledgement, a defer or a capture — never an approval.
//     Earbuds are short spoken exchanges and are not built yet. Glasses are
//     much later and deliberate. Nothing is ever always-watching.
//   - A surface Echo cannot actually reach is named as not reachable. It is
//     never quietly counted as delivered.
//   - Quiet hours hold everything except the thing you cannot sleep through,
//     and the wrist only buzzes when something is genuinely waiting on you.
//   - Approval never travels to a smaller surface. It happens in the platform.
//   - Pure module: no IO, no React, no clock beyond what the caller passes in.

import { type Urgency, urgencyRank } from "./awareness/urgency.ts";

export type Body = "phone" | "desk" | "wrist" | "telegram" | "earbuds" | "glasses";

export const BODY_LABEL: Record<Body, string> = {
  phone: "your phone",
  desk: "the desk",
  wrist: "your watch",
  telegram: "Telegram",
  earbuds: "earbuds",
  glasses: "glasses",
};

/** What each surface is for, and where its edge is. */
export const BODY_ROLE: Record<Body, { role: string; edge: string; built: boolean }> = {
  phone: {
    role: "the main surface — the whole day, and where you approve things",
    edge: "nothing",
    built: true,
  },
  desk: {
    role: "deep work — the long read, the full record, the writing",
    edge: "it does not chase you; you come to it",
    built: true,
  },
  wrist: {
    role: "a glance: one thing or nothing, plus note, later and capture",
    edge: "it can never approve anything",
    built: true,
  },
  telegram: {
    role: "the pocket door — ask, capture, and the notices you opted into",
    edge: "it feeds the platform; consequential work still happens in it",
    built: true,
  },
  earbuds: {
    role: "short spoken exchanges, later",
    edge: "not built yet, and Echo will not pretend otherwise",
    built: false,
  },
  glasses: {
    role: "visual context, much later and deliberately",
    edge: "not built, and never always-watching",
    built: false,
  },
};

export type Reachable = {
  /** Surfaces Echo can actually reach right now. */
  bodies: Body[];
  quietHours?: boolean;
  /** True while the person is looking at the platform. */
  atThePlatform?: boolean;
};

export type ReachPlan = {
  /** Where this notice actually goes. */
  reach: Body[];
  /** Surfaces deliberately left alone, each with its reason. */
  held: Array<{ body: Body; why: string }>;
  /** A buzz with no words is honest when nothing is waiting on the person. */
  hapticOnly: boolean;
  words: string;
};

/**
 * One notice, one set of surfaces. Louder news reaches further; ordinary news
 * waits where the person will look anyway.
 */
export function planReach(urgency: Urgency, r: Reachable): ReachPlan {
  const have = new Set(r.bodies);
  const rank = urgencyRank(urgency);
  const critical = rank >= urgencyRank("critical");
  const needsYou = rank >= urgencyRank("time_sensitive");
  const changed = rank >= urgencyRank("attention");

  const reach: Body[] = [];
  const held: Array<{ body: Body; why: string }> = [];
  const consider = (body: Body, ok: boolean, why: string) => {
    if (!have.has(body)) {
      held.push({ body, why: "not reachable right now" });
      return;
    }
    if (ok) reach.push(body);
    else held.push({ body, why });
  };

  const quiet = !!r.quietHours && !critical;

  consider("phone", changed && !quiet, quiet ? "quiet hours" : "it can wait for Today");
  consider(
    "desk",
    changed && !!r.atThePlatform,
    r.atThePlatform ? "it can wait for Today" : "you are not at the desk",
  );
  consider("wrist", needsYou && !quiet, quiet ? "quiet hours" : "a wrist is for what is waiting on you");
  consider("telegram", needsYou && !quiet, quiet ? "quiet hours" : "not worth a message");
  for (const body of ["earbuds", "glasses"] as Body[]) {
    held.push({ body, why: "not built yet" });
  }

  const hapticOnly = reach.includes("wrist") && !needsYou;
  const words =
    reach.length === 0
      ? quiet
        ? "Held until quiet hours end. Nothing here is worth waking you for."
        : "Kept in Today. Nothing here is worth interrupting you for."
      : `Reaching ${reach.map((b) => BODY_LABEL[b]).join(" and ")}. Approving it still happens in the platform.`;

  return { reach, held, hapticOnly, words };
}

/** How Echo describes its own surfaces when asked, without overclaiming one. */
export function reachWords(): string {
  const lines = (Object.keys(BODY_ROLE) as Body[]).map((b) => {
    const { role, edge, built } = BODY_ROLE[b];
    const state = built ? "" : " Not built yet.";
    return `${BODY_LABEL[b]} — ${role}. Edge: ${edge}.${state}`;
  });
  return [
    "Where Echo speaks, and where it does not:",
    ...lines,
    REACH_LAW,
  ].join("\n");
}

export const REACH_LAW =
  "Smaller surfaces say less, never something different, and approval never leaves the platform. Echo is never always-watching, and a surface it cannot reach is named, not counted as delivered.";
