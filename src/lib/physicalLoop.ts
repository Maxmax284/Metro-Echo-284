// physicalLoop — the phone-to-receipt loop, described from records only.
//
// Nothing here infers. Every step is either backed by a recorded event or it
// says it is still waiting. There is no "probably" state.

export type LoopStepState = "done" | "waiting";

export interface LoopStep {
  key: string;
  /** What happened, in plain words. */
  label: string;
  /** The evidence, or what is still missing. */
  line: string;
  state: LoopStepState;
}

export interface LoopPromise {
  id: string;
  summary: string;
  status: string;
}

export interface LoopFacts {
  /** A Telegram chat is paired to this account. */
  linked: boolean;
  /** Last message Echo received from the phone. */
  lastMessageAt: string | null;
  /** The most recent promise that arrived from the phone. */
  promise: LoopPromise | null;
  /** When a reminder for that promise was actually delivered. */
  reminderSentAt: string | null;
  /** The promise was closed from a chat button. */
  closedFromChat: boolean;
}

export interface SweepReading {
  at: string;
  read: number;
  unreadable: number;
  scanned: number;
}

/** The five steps of the loop, each answered by a record or left waiting. */
export function buildPromiseWalk(f: LoopFacts): LoopStep[] {
  const promise = f.promise;
  const closed = promise?.status === "done";

  return [
    {
      key: "sent",
      label: "Sent from your phone",
      line: f.lastMessageAt
        ? `Last message received ${f.lastMessageAt}.`
        : f.linked
          ? "Chat is linked. Send Echo a message to start the loop."
          : "No chat linked yet. Pair Telegram in Connected Accounts.",
      state: f.lastMessageAt ? "done" : "waiting",
    },
    {
      key: "landed",
      label: "Landed as a promise",
      line: promise
        ? `"${promise.summary}" was drafted from that message. Nothing ran.`
        : "Nothing has arrived as a promise yet. Say what you owe someone and it lands here.",
      state: promise ? "done" : "waiting",
    },
    {
      key: "reminded",
      label: "Reminder delivered",
      line: f.reminderSentAt
        ? `Reminder sent to your phone ${f.reminderSentAt}.`
        : promise
          ? "No reminder has gone out for this one yet."
          : "Waiting on a promise first.",
      state: f.reminderSentAt ? "done" : "waiting",
    },
    {
      key: "acknowledged",
      label: "Marked done from chat",
      line: f.closedFromChat
        ? "You closed it from the chat button, and the receipt says so."
        : promise
          ? "Not closed from chat yet. The buttons acknowledge a promise — they never execute anything."
          : "Waiting on a promise first.",
      state: f.closedFromChat ? "done" : "waiting",
    },
    {
      key: "verified",
      label: "Shows as done in Work",
      line: closed
        ? "The promise reads done in Commitments, so the loop closed."
        : promise
          ? `It still reads "${promise.status}" in Commitments.`
          : "Waiting on a promise first.",
      state: closed ? "done" : "waiting",
    },
  ];
}

/** How many steps of the walk are actually backed by records. */
export function walkProgress(steps: LoopStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}

/**
 * The sweep line. A sweep reports a diff, never a status — "nothing new to
 * read" is a real answer, "synchronized" is not.
 */
export function describeSweep(sweep: SweepReading | null, pendingPages: number): string {
  if (!sweep) {
    return pendingPages > 0
      ? `${pendingPages} ${pendingPages === 1 ? "page is" : "pages are"} waiting to be read. Echo has not swept yet.`
      : "Echo has not read any pages yet. Photograph a page and send it in.";
  }
  const parts: string[] = [];
  if (sweep.read > 0) parts.push(`${sweep.read} ${sweep.read === 1 ? "page" : "pages"} read`);
  if (sweep.unreadable > 0) parts.push(`${sweep.unreadable} unreadable`);
  if (parts.length === 0) parts.push("nothing new to read");
  const tail = pendingPages > 0 ? ` ${pendingPages} still waiting.` : "";
  return `${parts.join(", ")}.${tail}`;
}
