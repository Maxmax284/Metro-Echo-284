import {
  calendarProposalTitle,
  isCalendarProposal,
  type CalendarProposal,
} from "./calendarProposal.ts";

export type CalendarActionSnapshot = {
  status: string;
  payload: unknown;
  result?: Record<string, unknown> | null;
};

/** Follow-ups that must be answered from the action receipt, never model memory. */
export function asksCalendarActionStatus(text: string): boolean {
  const t = text.trim();
  return /\b(did you|have you)\b[\s\S]{0,35}\b(do|did|add|write|put|make)\b/i.test(t)
    || /\b(is|was) (it|that) (actually )?(on|in|added to|written to) (my )?(google )?calendar\b/i.test(t)
    || /\b(it'?s|that'?s) for (the )?\d{1,2}(st|nd|rd|th)?\b[\s\S]{0,20}\b(correct|right)\b/i.test(t);
}

function proposedStart(proposal: CalendarProposal, result?: Record<string, unknown> | null): string | null {
  if (typeof result?.start === "string") return result.start;
  return proposal.changes.find((change) => change.field === "time")?.after
    ?? proposal.event?.starts_at
    ?? null;
}

function whenLine(value: string | null, timeZone: string): string {
  if (!value) return "the time shown in the proposal";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Truthful answer to “did you do it?” from one exact action and its provider receipt. */
export function calendarActionStatusLine(action: CalendarActionSnapshot, timeZone: string): string | null {
  if (!isCalendarProposal(action.payload)) return null;
  const title = calendarProposalTitle(action.payload).replace(/^Add /, "").replace(/ to your calendar$/, "");
  const when = whenLine(proposedStart(action.payload, action.result), timeZone);
  if (action.status === "staged" || action.status === "proposed") {
    return `Not yet. I prepared ${title} for ${when}. It is waiting on your Yes before anything goes to Google.`;
  }
  if (action.status === "approved") {
    return `You approved ${title} for ${when}, but Google has not confirmed the write yet.`;
  }
  if (action.status === "executed" || action.status === "audited") {
    if (action.result?.provider === "google_calendar" && typeof action.result?.event_id === "string") {
      return `Yes. Google confirmed ${title} for ${when}, and the receipt is saved.`;
    }
    return `That action is marked complete, but I do not have a Google confirmation receipt. I will not call it written.`;
  }
  if (action.status === "cancelled" || action.status === "rolled_back") {
    return "No. That proposal was dropped. Nothing changed in Google.";
  }
  return `I can see the proposal for ${title}, but I cannot verify a Google write from its receipt.`;
}