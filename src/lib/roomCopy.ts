// roomCopy — the information layer's words, in one place.
//
// Doctrine: the walls give Echo identity, the copy gives it clarity. Every
// major section gets one plain line that says what lives there. Every room can
// explain itself without a tutorial and without an AI call. Nothing here
// invents state; these are descriptions of structure, not readings of data.

export type RoomKey = "today" | "work" | "ask" | "receipts" | "settings";

/** One line per room, shown on first contact and behind "What is this?". */
export const ROOM_INTRO: Record<RoomKey, string> = {
  today: "The short version of what matters now.",
  work: "What came in, what is moving, and what Echo noticed.",
  ask: "Talk naturally. Add a file, photo, or voice note when needed.",
  receipts: "What happened, what worked, and what did not.",
  settings: "How Echo behaves, remembers, and reaches you.",
};

/**
 * The grounded answer to "explain this screen". Plain sentences, no jargon, no
 * guessing — this is what the room actually is.
 */
export const ROOM_EXPLAIN: Record<RoomKey, string[]> = {
  today: [
    "Today is the short version of what matters now.",
    "Current read tells you what matters. Needs you holds decisions. Coming up holds your day. Changed shows what just moved.",
    "Open a line for the detail. Nothing runs on its own.",
  ],
  work: [
    "Work opens with the strongest next move.",
    "Coming in holds arrivals and the calendar. In motion holds projects, promises, and work waiting on you.",
    "Echo noticed keeps deeper readings and place context out of the way until they matter.",
  ],

  ask: [
    "Echo is a conversation with a workspace behind it.",
    "Threads keep their own context: what they were about, which space owned them, and what they produced.",
    "You can attach a photo, a file, or a voice note. Echo reads and drafts — it never executes from here.",
  ],
  receipts: [
    "Receipts shows what happened and what did not go through.",
    "The short read comes first. The full record keeps who, when, and where it came from.",
    "Open the record when you need the proof.",
  ],
  settings: [
    "Settings is the back of house.",
    "Grouped by what it affects: you, time, awareness, channels, and the machine itself.",
  ],
};

/**
 * Section descriptions. Keys are stable and also used for helper familiarity,
 * so renaming a key resets that section's helper copy on purpose.
 */
export const SECTION_NOTE = {
  "today.attention": "What is waiting on you right now.",
  "today.next": "Upcoming promises and follow-ups.",
  "today.changed": "Recent state changes across this space.",
  "today.fresh": "New captures that have not been sorted yet.",
  "today.resume": "Pick up work that is still open.",
  "today.live": "Live activity Echo already recorded.",
  "today.security": "Anything unusual about access or trust.",
  "work.projects": "The jobs Echo is tracking for you.",
  "work.state": "The short version of where work stands right now.",
  "work.lands": "Everything that arrives, gets promised, or gets written down.",
  "work.looks": "Where Echo reads, searches, and watches for you.",

  "work.daily": "The three lanes you touch every day.",
  "work.knowledge": "What Echo has read, written, and remembered.",
  "work.deeper": "Denser views for when you want the whole picture.",
  "work.desks": "Desks hold the different kinds of work Echo tracks.",
  "receipts.lifecycle": "How actions moved from proposed to done.",
  "receipts.log": "Every recorded change, newest first.",
  "ask.threads": "Threads keep their own context and outputs.",
} as const;

export type SectionKey = keyof typeof SECTION_NOTE;

export function sectionNote(key: SectionKey): string {
  return SECTION_NOTE[key];
}

/**
 * The structural map: four rooms, one sentence each, and the objects each one
 * owns. This is a reference screen, not a tour — no steps, no carousel. Object
 * names here must be the canonical nouns from `vantaNouns.ts`.
 */
export const ROOM_MAP: Array<{
  key: Exclude<RoomKey, "settings">;
  title: string;
  purpose: string;
  owns: string[];
}> = [
  {
    key: "today",
    title: "Today",
    purpose: "What matters now.",
    owns: ["Live activity", "Current attention", "Agenda", "Recent changes"],
  },
  {
    key: "work",
    title: "Work",
    purpose: "Where ongoing work lives.",
    owns: ["Projects", "Commitments", "Actions", "Artifacts", "Memory", "Deeper tools"],
  },
  {
    key: "ask",
    title: "Echo",
    purpose: "Talk to Echo with context.",
    owns: ["Threads", "Files", "Research", "Questions", "Prepared work"],
  },
  {
    key: "receipts",
    title: "Receipts",
    purpose: "What happened and why.",
    owns: ["State changes", "Approvals", "Actions", "Audit history"],
  },
];

/**
 * ROOM_HELP — the one shape every room answers in.
 *
 * Doctrine: help is written, never generated, and every room answers the same
 * six questions in the same order so the shape itself becomes familiar. `never`
 * is the law the room holds; `empty` is why the room can look bare without that
 * being bad news. Nothing here reads state.
 */
export type RoomHelpCopy = {
  /** What this room is for. */
  forWhat: string;
  /** What lands here, and how it got here. */
  lands: string;
  /** What you can do here. */
  canDo: string;
  /** What this room will never do. */
  never: string;
  /** Where things go next. */
  next: string;
  /** Why it looks empty, when it is empty. */
  empty: string;
};

export const ROOM_HELP: Record<RoomKey, RoomHelpCopy> = {
  today: {
    forWhat: "The short version of what matters now, so you don't have to open five desks to find out.",
    lands:
      "Anything already recorded elsewhere: promises coming due, captures nobody sorted yet, changes Echo wrote down, and readings from a watch you connected.",
    canDo: "Read it, then tap a row to open the desk that actually owns it.",
    never: "Today never runs anything and never changes a record. It only reads.",
    next: "Every tap lands on the real desk, where approval and receipts happen.",
    empty:
      "Nothing is waiting on you and nothing has changed recently. Send something in from Telegram, email or a photo and this room fills itself.",
  },
  work: {
    forWhat: "The map of ongoing work: which projects exist and which desk holds what.",
    lands:
      "Projects you created, plus everything you attached to them — notes, promises, actions, briefs, documents and dated items.",
    canDo:
      "Open a desk, review what is waiting, approve an action, close a promise, or attach a capture to a project.",
    never: "Work never approves or executes on your behalf, and never reaches outside your active space.",
    next: "Every change you make here writes a receipt, and overdue or drifting items resurface in Today.",
    empty:
      "You have no projects yet, so the desks have nothing to sort into. Make one project and the rest of the room has somewhere to put things.",
  },
  ask: {
    forWhat: "A conversation that already knows your workspace, so you don't re-explain yourself.",
    lands:
      "Threads you started, plus anything you attached to them: a photo, a file, a voice note, or a project you pointed the thread at.",
    canDo: "Talk, attach, have Echo read or research, and save the result to a desk as a draft.",
    never: "Echo never executes. It drafts and suggests; approval only happens on the desk that owns the object.",
    next: "Saving from a thread files a note, a promise or a proposed action — and records where it came from.",
    empty: "No threads yet. Ask one plain question and the thread keeps its own context from then on.",
  },
  receipts: {
    forWhat: "The evidence room: proof of what happened, in order, without interpretation.",
    lands: "Every recorded state change — approvals, results, edits, rollbacks, deliveries and syncs.",
    canDo: "Read a line, unfold what changed before and after, and see whether it was reversed.",
    never: "Nothing here can be edited or deleted, and nothing here can be re-run.",
    next: "A receipt is the end of the line. It stays as the record other rooms point back to.",
    empty: "Nothing has changed state yet. The first approval you make writes the first line.",
  },
  settings: {
    forWhat: "The back of house: how Echo behaves, remembers, speaks and reaches you.",
    lands: "Your own choices — channels you connected, consents you gave, and the way you want to be spoken to.",
    canDo: "Connect a channel, switch a sense on or off, set quiet hours, and check what is actually reaching you.",
    never: "Settings never turns a sense on for you, and never sends on a channel you have not connected.",
    next: "A connection shows its honest state here, and anything it delivers appears in Receipts.",
    empty: "Nothing is connected yet, so most states read as off. That is the truth, not a fault.",
  },
};

/** The fixed question order. Rendering reads this, so the shape never drifts. */
export const ROOM_HELP_ORDER: Array<{ key: keyof RoomHelpCopy; label: string }> = [
  { key: "forWhat", label: "What this is for" },
  { key: "lands", label: "What lands here" },
  { key: "canDo", label: "What you can do" },
  { key: "never", label: "What it will never do" },
  { key: "next", label: "Where things go next" },
  { key: "empty", label: "Why it can look empty" },
];
