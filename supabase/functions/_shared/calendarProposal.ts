// calendarProposal — the shape of a proposed calendar change.
//
// Doctrine: a calendar proposal is a staged action like any other. It never
// writes. It carries which event it means, exactly what would change (before
// and after), why, where the "why" came from, what it collides with, and
// whether provider write access exists at all.
//
// While the only calendar source is a read-only .ics feed, an approved proposal
// is HELD, never applied — see `writeCeilingLine`.

/** Google Calendar event ids are the iCal UID without the @google.com suffix. */
export function providerEventIdFromUid(uid: string | null): string | null {
  if (!uid) return null;
  if (uid.toLowerCase().endsWith("@google.com")) {
    return uid.slice(0, -"@google.com".length);
  }
  return uid;
}

export type CalendarWriteState = "read_only" | "connected";

const FIELD_LABELS: Record<string, string> = {
  time: "Time",
  title: "Title",
  location: "Location",
  description: "Notes",
  reminder: "Reminder",
  existence: "Event",
};

/** Human label for a change field, used identically on every surface. */
export function calendarFieldLabel(field: unknown): string {
  return FIELD_LABELS[String(field ?? "").trim().toLowerCase()] ?? "Detail";
}

export function normalizeCalendarChangeField(field: unknown): CalendarChangeField {
  const raw = String(field ?? "").trim().toLowerCase();
  return (raw in FIELD_LABELS ? raw : "description") as CalendarChangeField;
}

export type CalendarChangeField =
  | "time"
  | "title"
  | "location"
  | "description"
  | "reminder"
  | "existence";

export type CalendarExecuteMode = "create" | "update" | "delete";

/** One field moving from one value to another. `before: null` means "not set". */
export type CalendarFieldChange = {
  field: CalendarChangeField;
  label: string;
  before: string | null;
  after: string | null;
};

/**
 * Which event the proposal means. Row ids are NOT usable: every calendar sync
 * deletes and re-inserts its window, so a row id is not stable between syncs.
 * `uid + starts_at` (within a feed) is the most durable identity available
 * until provider event ids exist.
 */
export type CalendarEventRef = {
  feed_id: string | null;
  uid: string | null;
  starts_at: string | null;
  ends_at: string | null;
  title: string;
  /** Last known location from the feed; helps track place context across changes. */
  location?: string | null;
};

export type CalendarProposalSource = {
  /** "telegram", "email", "file", "calendar", "you"… */
  kind: string;
  id?: string | null;
  /** One human line: "the clinic's Telegram message". */
  note: string;
};

export type CalendarProposal = {
  kind: "calendar_change";
  /** Bumped on every refinement so an approval can only match what was shown. */
  version: number;
  /** null for a brand-new event. */
  event: CalendarEventRef | null;
  changes: CalendarFieldChange[];
  /** People Google would notify. 0 means nobody else is affected. */
  attendee_count: number;
  source: CalendarProposalSource | null;
  /** Plain lines: "overlaps Standup, 15:00". */
  conflicts: string[];
  write_state: CalendarWriteState;
  /** Where the Yes/No buttons live, so approving elsewhere can retire them. */
  telegram?: TelegramProposalRef | null;
};

/** The exact message carrying this proposal's buttons in Telegram. */
export type TelegramProposalRef = { chat_id: number; message_id: number };

/** Remember where the buttons are. Nothing else about the proposal changes. */
export function withTelegramRef(
  proposal: CalendarProposal,
  ref: TelegramProposalRef,
): CalendarProposal {
  return { ...proposal, telegram: ref };
}

/**
 * Whether opening the app actually earns its place. Ordinary proposals are
 * decided in the conversation; depth is for things you'd want to look at.
 */
export function calendarProposalNeedsDepth(proposal: CalendarProposal): boolean {
  return calendarProposalRisk(proposal) === "high" || proposal.conflicts.length > 1;
}

/** What Telegram says when the same change was already decided somewhere else. */
export function settledElsewhereLine(status: string): string {
  if (status === "cancelled") return "Dropped in Metro Echo. Nothing changed.";
  if (status === "approved") return "Approved in Metro Echo. Nothing changed in Google.";
  return "Already decided in Metro Echo.";
}

export type BuildCalendarProposalInput = {
  event?: CalendarEventRef | null;
  changes: CalendarFieldChange[];
  attendeeCount?: number;
  source?: CalendarProposalSource | null;
  conflicts?: string[];
  writeState?: CalendarWriteState;
};

export function buildCalendarProposal(input: BuildCalendarProposalInput): CalendarProposal {
  return {
    kind: "calendar_change",
    version: 1,
    event: input.event ?? null,
    changes: (input.changes ?? []).filter((c) => c && c.label),
    attendee_count: Math.max(0, Math.trunc(input.attendeeCount ?? 0)),
    source: input.source ?? null,
    conflicts: (input.conflicts ?? []).filter(Boolean),
    write_state: input.writeState === "connected" ? "connected" : "read_only",
  };
}

/** A refinement changes the proposal, never the provider. Version moves up. */
export function refineCalendarProposal(
  proposal: CalendarProposal,
  changes: CalendarFieldChange[],
): CalendarProposal {
  return { ...proposal, version: proposal.version + 1, changes };
}

export function isCalendarProposal(payload: unknown): payload is CalendarProposal {
  const p = payload as CalendarProposal | null;
  return !!p && typeof p === "object" && p.kind === "calendar_change" && Array.isArray(p.changes);
}

export function isCancellation(proposal: CalendarProposal): boolean {
  return proposal.changes.some((c) => c.field === "existence" && c.after === null);
}

export function isCreation(proposal: CalendarProposal): boolean {
  return !proposal.event;
}

/**
 * Risk follows consequence, not effort. Anything that makes Google notify other
 * people is never one-tap; cancelling on top of that is the strongest gate.
 */
export function calendarProposalRisk(
  proposal: CalendarProposal,
): "low_reversible" | "standard" | "high" {
  const cancelling = isCancellation(proposal);
  if (cancelling && proposal.attendee_count > 0) return "high";
  if (cancelling || proposal.attendee_count > 0) return "standard";
  return "low_reversible";
}

/** Short title for the action row. */
export function calendarProposalTitle(proposal: CalendarProposal): string {
  const name = proposal.event?.title?.trim() || proposal.changes.find((c) => c.field === "title")?.after?.trim() || "an event";
  if (isCreation(proposal)) return `Add ${name} to your calendar`;
  if (isCancellation(proposal)) return `Cancel ${name}`;
  const fields = proposal.changes.map((c) => c.label.toLowerCase());
  if (fields.length === 1) return `Change ${fields[0]} on ${name}`;
  return `Update ${name}`;
}

/** "2:00 PM → 3:30 PM", "No location → 42 Sathorn Rd". */
export function changeLine(change: CalendarFieldChange): string {
  const before = change.before ?? `No ${change.label.toLowerCase()}`;
  const after = change.after ?? "Removed";
  return `${change.label}: ${before} → ${after}`;
}

export function changeLines(proposal: CalendarProposal): string[] {
  return proposal.changes.map(changeLine);
}

/**
 * The honest ceiling. Until provider write access exists, an approval is held —
 * the words "done" and "synced" are not available to us.
 */
export function writeCeilingLine(state: CalendarWriteState): string | null {
  if (state === "connected") return null;
  return "Nothing has changed yet — Google write access isn't connected.";
}

/** What an approval actually did, in the user's language. */
export function approvalOutcomeLine(state: CalendarWriteState): string {
  return state === "connected"
    ? "Done. Google confirmed it, and the receipt is saved."
    : "Held, ready to apply. Google write access isn't connected yet, so nothing changed there.";
}

/** Consequence sentence shown before a stronger confirmation. */
export function consequenceLine(proposal: CalendarProposal): string | null {
  if (proposal.attendee_count <= 0) return null;
  const people = proposal.attendee_count === 1 ? "1 person" : `${proposal.attendee_count} people`;
  return isCancellation(proposal)
    ? `${people} get a cancellation from Google.`
    : `${people} get an update from Google.`;
}

/** Compact multi-line read used by Telegram and by the widget. */
export function proposalSummary(proposal: CalendarProposal): string {
  const lines = [calendarProposalTitle(proposal), ...changeLines(proposal)];
  for (const conflict of proposal.conflicts) lines.push(`Heads up: ${conflict}`);
  const consequence = consequenceLine(proposal);
  if (consequence) lines.push(consequence);
  if (proposal.source) lines.push(`From ${proposal.source.note}.`);
  const ceiling = writeCeilingLine(proposal.write_state);
  if (ceiling) lines.push(ceiling);
  return lines.join("\n");
}
