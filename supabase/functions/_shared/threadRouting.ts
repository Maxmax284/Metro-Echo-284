// threadRouting — where an inbound message belongs.
//
// Doctrine: one Echo, one brain. Telegram is not a second product with its own
// chat history; it is another mouth on the same situations. But a pocket message
// must not land in the middle of unrelated desk work either, and a week-old
// Telegram thread must not silently swallow a brand new subject.
//
// So the decision is made once, here, in a pure function both runtimes read:
//
//   continue  — this is the same situation that was already open on this channel
//   attach    — it belongs to a specific existing thread (a reply to a notice,
//               an explicit "about <record>" hand-off)
//   fresh     — a new situation starts its own thread
//
// Scope is authoritative in every branch: a personal message can never continue
// a workspace thread and vice versa. Nothing here writes; the caller acts on the
// verdict and keeps the receipts.

export type ThreadRouteDecision = "continue" | "attach" | "fresh";

export type InboundSignal = {
  /** What the person actually said. */
  text: string;
  /** Milliseconds since the channel's open thread last spoke. Null = none open. */
  msSinceLastMessage: number | null;
  /** Scope the inbound message is being handled in. */
  scope: "personal" | "organization";
  /** Scope of the channel's currently open thread, if there is one. */
  openThreadScope?: "personal" | "organization" | null;
  /** True when the channel has an open thread at all. */
  hasOpenThread: boolean;
  /** Set when the message is a reply to a specific Echo notice / record. */
  replyToThreadId?: string | null;
  /** Set when the message is a reply to a record that has its own thread. */
  contextThreadId?: string | null;
  /** True when the open thread is still mid-draft (a calendar draft, etc). */
  openThreadAwaitingAnswer?: boolean;
};

export type ThreadRoute = {
  decision: ThreadRouteDecision;
  /** The thread to attach to, when the decision is "attach". */
  threadId: string | null;
  /** Plain English, for receipts and for "why did this land here?". */
  reason: string;
};

/** A situation goes cold after this long without a word on the channel. */
export const SITUATION_IDLE_MS = 6 * 60 * 60 * 1000; // 6 hours

const FRESH_START = /^(?:\/(?:new|start|reset)\b|new (?:thread|chat|topic|subject)\b|start (?:over|fresh|again)\b|different (?:thing|subject|topic)\b|forget (?:that|it)\b|never ?mind\b|change of subject\b)/i;

/** True when the person explicitly asked to start clean. */
export function asksForFreshStart(text: string): boolean {
  return FRESH_START.test(text.trim());
}

const CONTINUES = /^(?:and\b|also\b|but\b|so\b|then\b|what about\b|plus\b|yes\b|yeah\b|no\b|ok(?:ay)?\b|do it\b|go ahead\b|that one\b|same\b|it\b|they\b|he\b|she\b)/i;

/** True when the wording only makes sense as a continuation of something. */
export function readsAsContinuation(text: string): boolean {
  return CONTINUES.test(text.trim());
}

/**
 * Decide where an inbound message belongs. Pure: same input, same verdict, on
 * the server and in the app.
 */
export function routeInbound(signal: InboundSignal): ThreadRoute {
  const scopeMatches =
    !signal.hasOpenThread ||
    (signal.openThreadScope ?? signal.scope) === signal.scope;

  // 1. A reply to a specific notice or record always attaches to that thread —
  //    but only inside the same scope.
  const bound = signal.replyToThreadId ?? signal.contextThreadId ?? null;
  if (bound && scopeMatches) {
    return {
      decision: "attach",
      threadId: bound,
      reason: signal.replyToThreadId
        ? "replied to something Echo raised, so it continues that situation"
        : "about a record that already has a thread",
    };
  }

  // 2. Scope changed: a personal message never continues workspace work.
  if (signal.hasOpenThread && !scopeMatches) {
    return { decision: "fresh", threadId: null, reason: "different scope than the open thread" };
  }

  // 3. A draft still waiting on an answer owns the next message, whatever it
  //    says — "never mind" is exactly how a person cancels a draft, and that
  //    cancellation belongs to the draft, not to a brand new thread.
  if (signal.hasOpenThread && signal.openThreadAwaitingAnswer) {
    return { decision: "continue", threadId: null, reason: "Echo was waiting on an answer" };
  }

  // 4. Explicit reset.
  if (asksForFreshStart(signal.text)) {
    return { decision: "fresh", threadId: null, reason: "asked to start fresh" };
  }

  if (!signal.hasOpenThread) {
    return { decision: "fresh", threadId: null, reason: "nothing open on this channel yet" };
  }


  const idle = signal.msSinceLastMessage;
  const cold = idle === null || idle > SITUATION_IDLE_MS;

  // 5. Wording that only parses as a continuation keeps the situation open even
  //    slightly past the idle line — otherwise "and the deposit?" loses its subject.
  if (cold && readsAsContinuation(signal.text) && idle !== null && idle < SITUATION_IDLE_MS * 4) {
    return { decision: "continue", threadId: null, reason: "reads as a continuation of the last thing" };
  }

  if (cold) {
    return { decision: "fresh", threadId: null, reason: "the last situation on this channel went cold" };
  }

  return { decision: "continue", threadId: null, reason: "same situation, still warm" };
}

/** One line for the receipt, so the routing is never a mystery afterwards. */
export function routeReceipt(route: ThreadRoute): string {
  const head =
    route.decision === "fresh" ? "Started a new situation"
      : route.decision === "attach" ? "Continued an existing situation"
        : "Stayed in the open situation";
  return `${head} — ${route.reason}.`;
}
