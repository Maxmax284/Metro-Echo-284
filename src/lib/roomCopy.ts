// roomCopy — the information layer's words, in one place.
//
// Doctrine: the walls give Vanta identity, the copy gives it clarity. Every
// major section gets one plain line that says what lives there. Every room can
// explain itself without a tutorial and without an AI call. Nothing here
// invents state; these are descriptions of structure, not readings of data.

export type RoomKey = "today" | "work" | "ask" | "receipts" | "settings";

/** One line per room, shown on first contact and behind "What is this?". */
export const ROOM_INTRO: Record<RoomKey, string> = {
  today: "The short version of what matters now.",
  work: "Projects live here. Desks organize everything else.",
  ask: "Ask naturally. Add a file, photo, or voice note when needed.",
  receipts: "Every recorded state change lands here.",
  settings: "How Vanta behaves, remembers, and reaches you.",
};

/**
 * The grounded answer to "explain this screen". Plain sentences, no jargon, no
 * guessing — this is what the room actually is.
 */
export const ROOM_EXPLAIN: Record<RoomKey, string[]> = {
  today: [
    "Today is the short version of what matters now.",
    "Needs attention is what is waiting on you. What's next is dated promises. What changed is the last few things Vanta recorded. Fresh in is new captures nobody has sorted yet.",
    "Tapping a row opens the place that owns it. Nothing runs on its own.",
  ],
  work: [
    "Work is where the jobs live.",
    "Projects are the main jobs. Inbox is what came in. Commitments are promises. Actions are things waiting for your approval.",
    "Knowledge holds briefs, documents, and memory. Deeper tools are for when you want the dense view.",
  ],
  ask: [
    "Ask is a conversation with a workspace behind it.",
    "Threads keep their own context: what they were about, which space owned them, and what they produced.",
    "You can attach a photo, a file, or a voice note. Vanta reads and drafts — it never executes from here.",
  ],
  receipts: [
    "Receipts is the evidence room.",
    "Every state change writes a line: what happened, who did it, when, and where it came from.",
    "Tap a receipt to unfold what changed, before and after, and whether it was reversed.",
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
  "today.live": "Live activity Vanta already recorded.",
  "today.security": "Anything unusual about access or trust.",
  "work.projects": "The jobs Vanta is tracking for you.",
  "work.state": "The short version of where work stands right now.",
  "work.lands": "Everything that arrives, gets promised, or gets written down.",
  "work.looks": "Where Vanta reads, searches, and watches for you.",

  "work.daily": "The three lanes you touch every day.",
  "work.knowledge": "What Vanta has read, written, and remembered.",
  "work.deeper": "Denser views for when you want the whole picture.",
  "work.desks": "Desks hold the different kinds of work Vanta tracks.",
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
    title: "Ask",
    purpose: "Talk to Vanta with context.",
    owns: ["Threads", "Files", "Research", "Questions", "Prepared work"],
  },
  {
    key: "receipts",
    title: "Receipts",
    purpose: "What happened and why.",
    owns: ["State changes", "Approvals", "Actions", "Audit history"],
  },
];
