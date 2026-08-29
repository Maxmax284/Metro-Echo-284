// All tutorial strings in one place. Edit here, not in components.
//
// The walkthrough is the five-minute orientation: the four rooms first, then
// the three tiers inside Work, then one honest safety line, then a check that
// the user actually feels oriented. No feature tour, no auto-advance.

export const WALKTHROUGH_SLIDES = [
  {
    title: "Five minutes, then you know your way around",
    body: "Vanta has four rooms and nothing else. Today, Work, Ask, Receipts. Everything you ever do lives in one of them.",
    pill: "Start here",
  },
  {
    title: "Room 1 · Today",
    body: "The short version of what matters now: what needs you, what's next, what changed, and what just arrived. Tap a row and it opens the place that owns it.",
    pill: "Today",
  },
  {
    title: "Room 2 · Work",
    body: "Where ongoing work lives — projects, promises, prepared steps, documents and your schedule. This is the room you'll spend the most time in.",
    pill: "Work",
  },
  {
    title: "Room 3 · Ask",
    body: "Talk to Vanta with a file, photo or voice note if you need to. It reads and drafts. It never runs anything from here.",
    pill: "Ask",
  },
  {
    title: "Room 4 · Receipts",
    body: "Every state change writes a line: what happened, who did it, when, and where it came from. If Vanta did something, it's in here.",
    pill: "Receipts",
  },
  {
    title: "Inside Work · Tier 1: Where things stand",
    body: "The top of Work is the state of play — your briefing, what you left open, and the week ahead. Read this before you decide anything.",
    pill: "Work · 1",
  },
  {
    title: "Inside Work · Tier 2: Where work lands",
    body: "The desks that hold your records: Projects, Inbox, Commitments, Actions, Briefs, Documents, Schedule. Anything you route, promise or approve ends up on one of them.",
    pill: "Work · 2",
  },
  {
    title: "Inside Work · Tier 3: Where Vanta looks",
    body: "Reading rooms: Memory, Sherlock, Awareness, Cockpit. Vanta reads these and drafts suggestions. Nothing in this tier acts on its own.",
    pill: "Work · 3",
  },
  {
    title: "One rule that never bends",
    body: "Capture never executes. Vanta can prepare a step, but you approve it inside Vanta before anything runs. Every desk tile has a \u201C?\u201D that tells you what it is and when to use it.",
    pill: "Safety",
  },
  {
    title: "Are you oriented?",
    body: "Four rooms: Today, Work, Ask, Receipts. Three tiers in Work: where things stand, where work lands, where Vanta looks. Tick the box if that landed \u2014 you can replay this any time from Settings.",
    pill: "Check",
  },
] as const;

/** The final slide's confirmation label. */
export const ORIENTED_CHECK = "I know the four rooms and the three Work tiers.";

export const WHAT_IS_THIS: Record<string, string> = {
  command_center:
    "Your Command Center is where everything rolls up. It shows what's going on, what needs you, and what changed across every project.",
  project_rollup:
    "Project cards summarize each project: what changed, what needs you, and what's connected. Tap one to open its full canvas.",
  operations_briefing:
    "A plain-English shift report. What's going on right now, what needs you, and why — refreshed when the underlying data changes.",
  connect_to:
    "Connect any two things — notes, commitments, reminders, files, projects. Vanta uses these connections to surface related items everywhere else.",
  brief_composer:
    "Vanta drafts a brief from your linked items and receipts. You review the draft, then approve to export a PDF or audio briefing.",
  saved_exports:
    "Every PDF or audio briefing you've approved. Re-download any of them; each one has a receipt in the Audit log.",
  receipts:
    "Every state change writes a receipt — what happened, when, who did it. Receipts are how you trust Vanta.",
  sherlock:
    "Sherlock notices possible connections, risks, and contradictions in your captures. It never acts — it only suggests.",
  project_health:
    "Health is derived from open items, overdue work, and recent activity. It always comes with a one-line reason.",
};

/**
 * Which orientation slide explains a given Work desk. Tier 2 desks (where work
 * lands) point at the tier-2 slide; reading rooms point at tier 3. Used by the
 * "Start from here" control on each desk card.
 */
export const DESK_SLIDE_INDEX: Record<string, number> = {
  projects: 6,
  inbox: 6,
  commitments: 6,
  actions: 6,
  briefs: 6,
  documents: 6,
  schedule: 6,
  memory: 7,
  sherlock: 7,
  awareness: 7,
  command: 7,
};

/** Slide index for a desk, defaulting to the Work room slide. */
export function slideForDesk(deskKey: string): number {
  return DESK_SLIDE_INDEX[deskKey] ?? 2;
}
