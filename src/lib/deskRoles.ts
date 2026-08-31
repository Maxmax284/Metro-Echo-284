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
  /** When to reach for this desk, phrased as the moment it applies. */
  useWhen: string;
  /** What an empty desk means — never just "nothing here". */
  emptyWhy: string;
  /** The things you can actually do here, verb-first, no execution implied. */
  options: string[];
  /** What happens the moment you open the desk. Truthful, never a promise. */
  onStart: string;
  /** Verb-first taps shown on the tile. All of them only open the desk. */
  actions: string[];
  /** The single tap that would fill an empty desk. */
  emptyAction: string;
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
    useWhen: "Use this when you have a job that will take more than one message.",
    emptyWhy: "No projects yet. Start one and captures can be attached to it.",
    options: ["Start a project", "Attach notes and promises to it", "Read its brief"],
    onStart: "Opens the Projects desk. Nothing is created until you name a project.",
    actions: ["Start a project", "Open the newest job"],
    emptyAction: "Start your first project",
  },
  inbox: {
    label: "Inbox",
    is: "Everything that came in and has not been sorted yet.",
    lands: "Forwarded email, Telegram messages, uploads, and quick notes.",
    you: "Read it, then file it to a project or turn it into a promise.",
    example: "A forwarded quote sits here until you file it.",
    useWhen: "Use this when something arrived and you have not decided where it goes yet.",
    emptyWhy: "Inbox is clear. New captures, forwarded mail and Telegram notes land here.",
    options: ["File it to a project", "Turn it into a promise", "Keep it as a note", "Discard it"],
    onStart: "Opens the Inbox. Nothing is filed until you pick a destination.",
    actions: ["Route what arrived", "Read the oldest one"],
    emptyAction: "See how things get in",
  },
  commitments: {
    label: "Commitments",
    is: "Promises with a date on them \u2014 yours and other people's.",
    lands: "You record one, or Vanta spots one in something you captured.",
    you: "Complete it, move the date, or hand it off.",
    example: "\u201CSend Nikki the schedule by Friday.\u201D",
    useWhen: "Use this when somebody is expecting something by a date.",
    emptyWhy: "No open promises. Record one, or Vanta adds it when it spots one in a capture.",
    options: ["Record a promise", "Mark one done", "Move the date", "Hand it to someone else"],
    onStart: "Opens Commitments. Closing a promise writes a receipt \u2014 nothing else changes.",
    actions: ["Record a promise", "Check what is due"],
    emptyAction: "Record your first promise",
  },
  actions: {
    label: "Actions",
    is: "Work Vanta has prepared but will not run until you approve it.",
    lands: "Vanta drafts one when something you captured implies a step.",
    you: "Review the details, then approve or discard. Nothing runs on its own.",
    example: "A drafted reminder message, waiting on your yes.",
    useWhen: "Use this when Vanta has prepared a step and you want to check it before it runs.",
    emptyWhy: "Nothing waiting on your approval. Drafts appear here before anything runs.",
    options: ["Read the draft in full", "Approve it", "Discard it", "Send it back for a change"],
    onStart: "Opens Actions. Opening a draft never runs it \u2014 approval is a separate tap.",
    actions: ["Review what is waiting", "Read the newest draft"],
    emptyAction: "See where drafts come from",
  },
  briefs: {
    label: "Briefs",
    is: "A short readable summary you can send or keep.",
    lands: "You compose one from a project, a day, or a set of items.",
    you: "Generate it, read it, export it as PDF or Word.",
    example: "A one-page catch-up on the Lamai rollout for a partner.",
    useWhen: "Use this when you need to tell someone else where things stand.",
    emptyWhy: "No briefs yet. Compose one from a project or a day.",
    options: ["Compose a brief", "Read an old one", "Export it as PDF or Word"],
    onStart: "Opens Briefs. Nothing leaves Vanta until you export it yourself.",
    actions: ["Compose a brief", "Read the last one"],
    emptyAction: "Compose your first brief",
  },
  documents: {
    label: "Documents",
    is: "Real documents \u2014 contracts and agreements Vanta drafts or reviews.",
    lands: "You upload one for review, or ask Vanta to draft one.",
    you: "Read the flagged risks, revise, then export.",
    example: "A coaching agreement Vanta checks for missing terms.",
    useWhen: "Use this when the thing you need is an actual document, not a note.",
    emptyWhy: "No documents yet. Upload one for review or ask Vanta to draft one.",
    options: ["Upload one for review", "Ask for a draft", "Revise a draft", "Export it"],
    onStart: "Opens Documents. Drafts stay drafts until you export them.",
    actions: ["Draft a document", "Upload one for review"],
    emptyAction: "Draft your first document",
  },
  memory: {
    label: "Memory",
    is: "Search across everything Vanta has ever held for you.",
    lands: "Nothing lands here directly \u2014 it reads all the other desks.",
    you: "Search a name, a phrase, or a date and follow it to the source.",
    example: "Find every mention of \u201Cinsurance\u201D from the last three months.",
    useWhen: "Use this when you half-remember something and need the source.",
    emptyWhy: "Nothing to search yet. Memory reads whatever the other desks hold.",
    options: ["Search a name or phrase", "Follow a result to its source", "Attach a result to a project"],
    onStart: "Opens Memory. It only reads \u2014 searching changes nothing.",
    actions: ["Search everything", "Browse recent notes"],
    emptyAction: "Capture something first",
  },
  schedule: {
    label: "Schedule",
    is: "Your day laid out in order \u2014 meetings and dated promises together.",
    lands: "Connected calendars and anything with a date on it.",
    you: "See what the day looks like before you commit to more.",
    example: "Two meetings, one promise due, one gap at 3pm.",
    useWhen: "Use this when you want to know if the day has room before saying yes.",
    emptyWhy: "Nothing dated yet. Connect a calendar or add a dated promise.",
    options: ["Read the day or week", "Connect a calendar", "Check what changed since last sync"],
    onStart: "Opens Schedule. Calendars are read-only \u2014 Vanta never writes back.",
    actions: ["Read the day", "Check what changed"],
    emptyAction: "Connect a calendar",
  },
  sherlock: {
    label: "Sherlock",
    is: "The investigator. It looks for patterns and quiet problems.",
    lands: "You point it at something, or it scans on a schedule.",
    you: "Read the findings and decide whether they matter.",
    example: "\u201CThree promises to the same person all slipped.\u201D",
    useWhen: "Use this when something feels off and you want it checked.",
    emptyWhy: "No findings. Sherlock only speaks when it has evidence.",
    options: ["Read a finding", "See the evidence behind it", "Say helpful or not right", "Accept the link"],
    onStart: "Opens Sherlock. Findings are suggestions until you accept one.",
    actions: ["Read the findings", "See this week's digest"],
    emptyAction: "See what Sherlock watches for",
  },
  awareness: {
    label: "Awareness",
    is: "What Vanta currently knows about your situation.",
    lands: "Time, place, device, and the sensors you opted into.",
    you: "Check what it is using, and turn off anything you would rather it ignored.",
    example: "Late night, at home, phone \u2014 so it holds the non-urgent nudges.",
    useWhen: "Use this when you want to know why Vanta is being quiet or loud.",
    emptyWhy: "No signals yet. Awareness fills in as you use Vanta.",
    options: ["See what Vanta is reading", "Turn a signal off", "Read why a notice appeared"],
    onStart: "Opens Awareness. Notices here are drafts \u2014 acting on one opens the real desk.",
    actions: ["See what Vanta reads", "Read recent notices"],
    emptyAction: "Choose what Vanta may read",
  },
  command: {
    label: "Cockpit",
    is: "The dense view for when you want everything on one screen.",
    lands: "Nothing new \u2014 it reformats what the other desks already hold.",
    you: "Scan a lot at once. Same records, tighter layout.",
    example: "Full day audit in a single pass.",
    useWhen: "Use this when you want the whole day in one pass.",
    emptyWhy: "Nothing to show yet. Cockpit reformats what the other desks hold.",
    options: ["Scan every desk at once", "Jump from any row to its desk"],
    onStart: "Opens Cockpit. Same records as the other desks, tighter layout.",
    actions: ["See everything at once"],
    emptyAction: "Fill a desk first",
  },
};


/**
 * The verb line. Every desk leads with what you do there, before any noun.
 * Existing vocabulary only — these invent no new object names.
 */
export const DESK_VERB: Record<DeskKey, string> = {
  projects: "Keep a job together.",
  inbox: "File what came in.",
  commitments: "Keep a promise.",
  actions: "Approve a step.",
  briefs: "Build something shareable.",
  documents: "Review and revise files.",
  schedule: "See what time is doing.",
  memory: "Find what Vanta already knows.",
  sherlock: "Investigate what feels off.",
  awareness: "See what Vanta is noticing.",
  command: "Read the dense operational view.",
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
