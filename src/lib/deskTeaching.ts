// deskTeaching — the five-part skeleton every Work desk wears.
//
// Doctrine: learning one desk should teach all of them. Each desk answers, in
// the same order and the same words: what happens here, what you can do, what
// Echo may prepare for you, what a real record looks like, and where a record
// goes after you touch it.
//
// Nothing here reads state and nothing here executes. It is copy, written once,
// so seven desks cannot drift into seven different products.

import type { DeskKey } from "@/lib/deskRoles";

/** An assist Echo can offer. Every one of these only ever prepares something. */
export type DeskAssist = {
  /** Verb-first, plain English. */
  label: string;
  /** The truthful consequence. Always ends in your approval, never in an act. */
  note: string;
};

/** A greyed sample record, shaped like the real thing this desk holds. */
export type DeskExampleCopy = {
  /** The headline a real record would carry. */
  title: string;
  /** One or two body lines, as a real record would read. */
  lines: string[];
  /** Small state markers — source, status, due. */
  chips: string[];
  /** The row of taps a real record would offer. Rendered dead. */
  buttons: string[];
  /** What this teaches, under the card. */
  caption: string;
};

export type DeskTeaching = {
  /** One sentence: what happens at this desk. */
  does: string;
  /** 3–5 verb-first things you can do. */
  doThis: string[];
  /** Which of doThis is the one to reach for first. */
  recommended: string;
  /** What Echo may prepare. Empty means Echo has nothing to offer here. */
  assists: DeskAssist[];
  /** Where a record goes after you touch it. One line. */
  next: string;
  /** The sample card shown only while the desk is empty. */
  example: DeskExampleCopy;
};

export const DESK_TEACHING: Record<DeskKey, DeskTeaching> = {
  projects: {
    does: "A project is the anchor for one job. Everything you capture can be attached to it.",
    doThis: ["Start a project", "Attach notes, files and promises", "Read where it stands", "Archive one that is finished"],
    recommended: "Start a project",
    assists: [
      { label: "Summarize where this project stands", note: "Echo drafts the summary. You read it before anyone else does." },
      { label: "Suggest what to attach", note: "Echo proposes unsorted captures that look related. You accept each one." },
    ],
    next: "Anything you attach shows up in the project's brief, and the attachment is recorded in Receipts.",
    example: {
      title: "Lamai Q3 rollout",
      lines: ["Schedule, staffing and the insurance renewal for the new term."],
      chips: ["4 attached", "1 promise due Fri", "quiet 6 days"],
      buttons: ["Open", "Attach", "Brief"],
      caption: "This is what a project looks like once you attach a few things to it.",
    },
  },
  inbox: {
    does: "Everything that arrives lands here first, unsorted, until you decide where it goes.",
    doThis: ["Route what arrived", "Turn one into a promise", "Keep it as a note", "Discard what does not matter"],
    recommended: "Route what arrived",
    assists: [
      { label: "Suggest where these belong", note: "Echo proposes a project per item. Nothing is filed until you accept." },
      { label: "Group what looks related", note: "Echo clusters arrivals that mention the same thing. You confirm the group." },
    ],
    next: "Once routed, an arrival lives in its project and stops asking for your attention here.",
    example: {
      title: "Forwarded: insurance quote for the new term",
      lines: ["\u201CHere's the number we discussed \u2014 valid until the 14th.\u201D"],
      chips: ["Email", "arrived 2h ago", "unsorted"],
      buttons: ["File to project", "Make it a promise", "Keep as note", "Discard"],
      caption: "Real arrivals look like this. The four taps are how it leaves the Inbox.",
    },
  },
  commitments: {
    does: "Promises with a date on them \u2014 the ones you made, and the ones made to you.",
    doThis: ["Record a promise", "Mark one done", "Move the date", "Hand it to someone else"],
    recommended: "Record a promise",
    assists: [
      { label: "Find promises in what I captured", note: "Echo proposes what looks like a promise. You confirm each one before it is recorded." },
      { label: "Draft the follow-up message", note: "Echo writes the message. Sending it is a separate approval." },
    ],
    next: "Closing a promise writes a receipt. Nothing else moves.",
    example: {
      title: "Send Nikki the schedule",
      lines: ["Promised to Nikki \u2014 spotted in a Telegram message on Monday."],
      chips: ["due Friday", "you owe", "open"],
      buttons: ["Mark done", "Move the date", "Remind me"],
      caption: "A promise says what, to whom, when, and how it got here.",
    },
  },
  actions: {
    does: "Steps Echo has prepared and will not run until you approve them.",
    doThis: ["Review what is waiting", "Read a draft in full", "Approve it", "Discard it"],
    recommended: "Review what is waiting",
    assists: [
      { label: "Explain what this step would do", note: "Echo describes the effect in plain English before you approve." },
    ],
    next: "Approving stages it. Running it is a second, separate tap \u2014 and it writes a receipt either way.",
    example: {
      title: "Remind Nikki about the schedule",
      lines: ["Send a short Telegram nudge tomorrow at 9am, because the promise is due Friday."],
      chips: ["Low risk \u00b7 reversible", "drafted from a capture", "waiting"],
      buttons: ["Approve", "Discard"],
      caption: "Nothing here runs until you tap Approve. Even then, running is a separate tap.",
    },
  },
  briefs: {
    does: "A short readable write-up of what Echo already holds, for someone else to read.",
    doThis: ["Compose a brief", "Read an old one", "Export it as PDF or Word"],
    recommended: "Compose a brief",
    assists: [
      { label: "Build this from the last 7 days", note: "Echo pre-fills the sources. You still tap to generate, and nothing leaves Echo until you export." },
    ],
    next: "A generated brief stays here with its receipt. Exporting is what puts it in your hands.",
    example: {
      title: "Operator brief \u2014 week of 24 Aug",
      lines: ["\u201CThree promises closed, one slipped. Insurance quote is live until the 14th. Staffing still open.\u201D"],
      chips: ["Operator", "7 days", "1 page"],
      buttons: ["Read", "Export PDF", "Export Word"],
      caption: "Each format reads differently. This is the operator one \u2014 short, blunt, no preamble.",
    },
  },
  documents: {
    does: "Real documents \u2014 contracts and agreements Echo drafts for you or reads back to you.",
    doThis: ["Draft from a template", "Upload one for review", "Revise a draft in plain English", "Export it"],
    recommended: "Draft from a template",
    assists: [
      { label: "Read this and flag what's missing", note: "Echo reads the upload and lists risks and gaps. It changes nothing." },
      { label: "Explain this clause in plain English", note: "Read-only. Echo translates, it does not rewrite unless you ask." },
    ],
    next: "A draft stays a draft until you export it. Every revision is recorded.",
    example: {
      title: "Mutual NDA \u2014 Lamai \u00d7 supplier",
      lines: ["Two clauses flagged: no term length, and the governing law is blank."],
      chips: ["Draft", "2 flags", "revised 1h ago"],
      buttons: ["Read", "Revise", "Export"],
      caption: "Uploads and drafts both land like this, with the flags on the front.",
    },
  },
  memory: {
    does: "Search across everything Echo holds. It only reads.",
    doThis: ["Search a name or phrase", "Follow a result to its source", "Attach a result to a project"],
    recommended: "Search a name or phrase",
    assists: [
      { label: "Find things that mention this", note: "Echo gathers related records. Nothing is changed or moved." },
    ],
    next: "Nothing changes by searching. Attaching a result is the only write, and you make it.",
    example: {
      title: "\u201Cinsurance\u201D \u2014 3 matches",
      lines: ["A Telegram note, a forwarded quote, and one promise, all from August."],
      chips: ["Memory", "read-only"],
      buttons: ["Open source", "Attach to project"],
      caption: "A result always shows you where it came from.",
    },
  },
  schedule: {
    does: "Your day and week in order \u2014 meetings and dated promises side by side.",
    doThis: ["Read the day or week", "Connect a calendar", "Check what changed since last sync"],
    recommended: "Read the day or week",
    assists: [
      { label: "Tell me what changed", note: "Echo reports the difference since the last sync. It never writes to your calendar." },
    ],
    next: "Calendars are read-only. Echo never writes back to them.",
    example: {
      title: "Thursday",
      lines: ["09:00 staff call \u00b7 13:00 supplier \u00b7 one promise due \u00b7 gap at 15:00."],
      chips: ["2 meetings", "1 due", "synced 20m ago"],
      buttons: ["Open day", "What changed"],
      caption: "Meetings and promises sit in one column, so the day reads once.",
    },
  },
  sherlock: {
    does: "The investigator. It looks for patterns and quiet problems and reports them.",
    doThis: ["Read a finding", "See the evidence behind it", "Say helpful or not right", "Accept the link"],
    recommended: "Read a finding",
    assists: [
      { label: "Show me why this triggered", note: "Echo shows the recorded evidence only \u2014 no new guessing." },
    ],
    next: "A finding is a suggestion until you accept it. Accepting writes the link and a receipt.",
    example: {
      title: "Three promises to the same person all slipped",
      lines: ["Nikki \u2014 schedule, roster and the quote, each moved at least once."],
      chips: ["pattern", "evidence: 3 records"],
      buttons: ["Why this triggered", "Helpful", "Not right"],
      caption: "Findings always carry their evidence. You decide if they matter.",
    },
  },
  awareness: {
    does: "What Echo currently knows about your situation, and what it is allowed to read.",
    doThis: ["See what Echo is reading", "Turn a signal off", "Read why a notice appeared"],
    recommended: "See what Echo is reading",
    assists: [],
    next: "Notices here are drafts. Acting on one opens the desk that owns the record.",
    example: {
      title: "Late evening, at home, phone",
      lines: ["Non-urgent nudges are being held until the morning."],
      chips: ["time", "place", "device"],
      buttons: ["Turn a signal off", "Why"],
      caption: "This is the reason Echo is quiet or loud at any given moment.",
    },
  },
  command: {
    does: "The dense view. Same records as every other desk, tighter layout.",
    doThis: ["Scan every desk at once", "Jump from any row to its desk"],
    recommended: "Scan every desk at once",
    assists: [],
    next: "Nothing is stored here. Every row belongs to a desk and opens there.",
    example: {
      title: "Full day, one screen",
      lines: ["Arrivals, promises, drafts and findings stacked in one pass."],
      chips: ["dense", "read-only"],
      buttons: ["Open row"],
      caption: "For when you want the whole day without walking the desks.",
    },
  },
};

export function deskTeaching(key: DeskKey): DeskTeaching {
  return DESK_TEACHING[key];
}

/**
 * How a draft becomes a receipt. Three steps, always the same three, used by
 * the Actions desk to make the invisible mechanism visible.
 */
export const DRAFT_ORIGIN: { step: string; line: string; desk: DeskKey }[] = [
  { step: "Something arrives", line: "A message, a note, a file, a page from your phone.", desk: "inbox" },
  { step: "Echo drafts a step", line: "If it implies a next move, Echo prepares it and stops.", desk: "actions" },
  { step: "You approve", line: "Nothing runs before this. The receipt is written either way.", desk: "actions" },
];

/**
 * The kinds of step Echo can actually draft today. Kept short and truthful —
 * if it is not built, it does not belong on this list.
 */
export const DRAFT_KINDS: string[] = [
  "A reminder message, ready to send",
  "A promise pulled out of something you captured",
  "A suggested link between a capture and a project",
  "A revision to a document draft",
];
