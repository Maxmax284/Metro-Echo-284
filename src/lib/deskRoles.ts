// deskRoles — plain-English job description for every desk in Work.
//
// Doctrine: a desk name is not an explanation. Every desk answers four things
// in words a first-time user understands: what it is, what lands here, what you
// do with it, and one concrete example. Nothing here reads state; this is
// structure, written down once.

import type { SurfaceId } from "@/lib/navigation";

export type DeskRole = {
  /** The canonical desk label. */
  label: string;
  /** One sentence: what this desk is, no jargon. */
  is: string;
  /** How things get here. */
  lands: string;
  /** What you actually do at this desk. */
  you: string;
  /** One concrete, everyday example. */
  example: string;
};

export type DeskKey = Extract<
  SurfaceId,
  | "inbox"
  | "commitments"
  | "actions"
  | "briefs"
  | "memory"
  | "schedule"
  | "sherlock"
  | "awareness"
  | "command"
  | "projects"
> | "documents";

export const DESK_ROLES: Record<DeskKey, DeskRole> = {
  projects: {
    label: "Projects",
    is: "The main jobs you are working on.",
    lands: "You start one, and anything captured can be attached to it.",
    you: "Open a project to see everything tied to it in one place.",
    example: "\u201CLamai rollout\u201D holds the notes, promises and files for that job.",
  },
  inbox: {
    label: "Inbox",
    is: "Everything that came in and has not been sorted yet.",
    lands: "Forwarded email, Telegram messages, uploads, and quick notes.",
    you: "Read it, then file it to a project or turn it into a promise.",
    example: "A forwarded quote sits here until you file it.",
  },
  commitments: {
    label: "Commitments",
    is: "Promises with a date on them \u2014 yours and other people's.",
    lands: "You record one, or Vanta spots one in something you captured.",
    you: "Complete it, move the date, or hand it off.",
    example: "\u201CSend Nikki the schedule by Friday.\u201D",
  },
  actions: {
    label: "Actions",
    is: "Work Vanta has prepared but will not run until you approve it.",
    lands: "Vanta drafts one when something you captured implies a step.",
    you: "Review the details, then approve or discard. Nothing runs on its own.",
    example: "A drafted reminder message, waiting on your yes.",
  },
  briefs: {
    label: "Briefs",
    is: "A short readable summary you can send or keep.",
    lands: "You compose one from a project, a day, or a set of items.",
    you: "Generate it, read it, export it as PDF or Word.",
    example: "A one-page catch-up on the Lamai rollout for a partner.",
  },
  documents: {
    label: "Documents",
    is: "Real documents \u2014 contracts and agreements Vanta drafts or reviews.",
    lands: "You upload one for review, or ask Vanta to draft one.",
    you: "Read the flagged risks, revise, then export.",
    example: "A coaching agreement Vanta checks for missing terms.",
  },
  memory: {
    label: "Memory",
    is: "Search across everything Vanta has ever held for you.",
    lands: "Nothing lands here directly \u2014 it reads all the other desks.",
    you: "Search a name, a phrase, or a date and follow it to the source.",
    example: "Find every mention of \u201Cinsurance\u201D from the last three months.",
  },
  schedule: {
    label: "Schedule",
    is: "Your day laid out in order \u2014 meetings and dated promises together.",
    lands: "Connected calendars and anything with a date on it.",
    you: "See what the day looks like before you commit to more.",
    example: "Two meetings, one promise due, one gap at 3pm.",
  },
  sherlock: {
    label: "Sherlock",
    is: "The investigator. It looks for patterns and quiet problems.",
    lands: "You point it at something, or it scans on a schedule.",
    you: "Read the findings and decide whether they matter.",
    example: "\u201CThree promises to the same person all slipped.\u201D",
  },
  awareness: {
    label: "Awareness",
    is: "What Vanta currently knows about your situation.",
    lands: "Time, place, device, and the sensors you opted into.",
    you: "Check what it is using, and turn off anything you would rather it ignored.",
    example: "Late night, at home, phone \u2014 so it holds the non-urgent nudges.",
  },
  command: {
    label: "Cockpit",
    is: "The dense view for when you want everything on one screen.",
    lands: "Nothing new \u2014 it reformats what the other desks already hold.",
    you: "Scan a lot at once. Same records, tighter layout.",
    example: "Full day audit in a single pass.",
  },
};

/** The short hint used on desk tiles: what lands here, in a few words. */
export const DESK_TILE_HINT: Record<DeskKey, string> = {
  projects: "The main jobs",
  inbox: "Unsorted arrivals",
  commitments: "Promises with dates",
  actions: "Waiting on your approval",
  briefs: "Summaries you can send",
  documents: "Contracts and drafts",
  memory: "Search everything",
  schedule: "Your day in order",
  sherlock: "Finds quiet problems",
  awareness: "What Vanta knows now",
  command: "Everything on one screen",
};

export function deskRole(key: DeskKey): DeskRole {
  return DESK_ROLES[key];
}

/** The four-line explanation, ordered, for the "What is this?" popover. */
export function deskExplainLines(key: DeskKey): string[] {
  const r = DESK_ROLES[key];
  return [r.is, `Gets here: ${r.lands}`, `You: ${r.you}`, `Example: ${r.example}`];
}
