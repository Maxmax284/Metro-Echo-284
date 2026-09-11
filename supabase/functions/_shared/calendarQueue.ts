/* One honest board for calendar edits: what's waiting on a yes, what got a yes
   but hasn't landed in Google, and what's actually written. No second action
   engine — these are the same `actions` rows the app reads. */
import {
  isCalendarProposal,
  calendarProposalTitle,
  changeLines,
  type CalendarProposal,
} from "./calendarProposal.ts";

export type CalendarQueueRow = {
  id: string;
  title?: string | null;
  status: string;
  payload: unknown;
  result?: unknown;
};

export type CalendarQueue = {
  text: string;
  /** Approved rows that have not been written yet — the only retryable ones. */
  retryIds: string[];
  /** Rows still waiting on a yes — stoppable without touching anything outside. */
  stopIds: string[];
};

function label(row: CalendarQueueRow): string {
  const proposal = row.payload as CalendarProposal;
  const title = row.title || calendarProposalTitle(proposal);
  const first = changeLines(proposal)[0];
  return first ? `${title} — ${first}` : title;
}

export function buildCalendarQueue(rows: CalendarQueueRow[]): CalendarQueue {
  const cal = rows.filter((r) => isCalendarProposal(r.payload));
  const queued = cal.filter((r) => r.status === "staged");
  const approved = cal.filter((r) => r.status === "approved");
  const written = cal.filter((r) => r.status === "executed" || r.status === "audited");

  if (!cal.length) {
    return {
      text: "No calendar edits in flight. Ask me to move or add something and it lands here first, waiting on your yes.",
      retryIds: [],
      stopIds: [],
    };
  }

  const lines: string[] = ["Calendar edits — where each one stands."];

  lines.push("", queued.length ? "Waiting on your yes:" : "Waiting on your yes: none.");
  queued.forEach((r) => lines.push(`· ${label(r)}`));

  lines.push("", approved.length ? "Approved, not written to Google yet:" : "Approved, not written yet: none.");
  approved.forEach((r) => lines.push(`· ${label(r)}`));

  lines.push("", written.length ? "Written to Google:" : "Written to Google: none yet.");
  written.slice(0, 5).forEach((r) => lines.push(`· ${label(r)}`));

  if (approved.length) lines.push("", "Hit Retry write and I'll push the approved ones to Google now.");

  return { text: lines.join("\n"), retryIds: approved.map((r) => r.id) };
}
