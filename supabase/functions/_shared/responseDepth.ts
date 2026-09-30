// responseDepth — one Echo, many bodies.
//
// The voice is the same everywhere (see brandVoice.ts and vantaIdentity.ts).
// What changes per body is DEPTH: how much of the same answer gets said. This is
// the single place that decision lives, so a channel can never quietly invent
// its own compression rules in prose.
//
// The law: compression removes detail, never meaning. Nothing appears in a
// smaller body that is absent from the larger one, and no body is allowed to
// drop uncertainty to sound tidier.
//
// Pure module — no IO, no Deno APIs, safe to mirror into the client.
import type { Verbosity } from "./awareness/compress.ts";
import type { CommunicationChannel } from "./awareness/deliver.ts";

export type VantaBody = "desk" | "phone" | "telegram" | "wrist" | "spoken";

export type DepthSpec = {
  /** What a person would call this body. */
  label: string;
  /** Sentence budget for the whole reply. */
  sentences: [number, number];
  /** May use short lists (two or three items), never headings. */
  lists: boolean;
  /** How sources are credited. */
  sources: "named" | "one" | "none";
  /** Ends with a way in (link or button) when there is somewhere to go. */
  link: boolean;
  /** Ends with the next step when something is waiting on the person. */
  next: boolean;
  /** The one-line character of this body. */
  character: string;
};

export const BODY_DEPTH: Record<VantaBody, DepthSpec> = {
  desk: {
    label: "Desk",
    sentences: [1, 14],
    lists: true,
    sources: "named",
    link: true,
    next: true,
    character: "The full read. Everything that changes the decision, what it's read off, then the next step.",
  },
  phone: {
    label: "Phone",
    sentences: [1, 12],
    lists: true,
    sources: "one",
    link: true,
    next: true,
    character: "The whole situation in pocket form. Verdict, the facts that change it, the next step — nothing decision-changing left out. A week gets a line per day that carries something, never a wall.",
  },
  telegram: {
    label: "Telegram",
    sentences: [1, 12],
    lists: true,
    sources: "one",
    link: true,
    next: true,
    character: "Street-plain and direct. Plain prose, no markdown, no headings. Complete beats compact when there is real substance.",
  },
  wrist: {
    label: "Watch",
    sentences: [1, 1],
    lists: false,
    sources: "none",
    link: false,
    next: false,
    character: "One thing. The single most consequential fact, nothing else.",
  },
  spoken: {
    label: "Spoken",
    sentences: [1, 1],
    lists: false,
    sources: "none",
    link: false,
    next: false,
    character: "One sentence, and an offer of the rest instead of reading it out.",
  },
};

/** Which body a recorded device class speaks through. */
export function bodyForDevice(device?: string | null): VantaBody {
  switch (device) {
    case "wearable":
    /* Glasses-class bodies get a glance, never a paragraph in your eyeline. */
    case "ambient":
      return "wrist";
    case "earbuds":
    case "vehicle":
      return "spoken";
    case "phone":
      return "phone";
    case "tablet":
    case "desk":
      return "desk";
    default:
      return "desk";
  }
}

/**
 * The order every answer follows, whatever the body. Shorter bodies stop
 * earlier in the sequence; they never reorder it.
 */
export const ANSWER_ORDER = `ANSWER ORDER (every body, every channel):
1. The answer. One line, no wind-up, no restating the question.
2. Why it's the answer — the reason, in the same breath.
3. What it's read off — the source and how fresh it is, when there is one.
4. What to do next — only when something is actually waiting on them.
Say less by stopping earlier in that list, never by shuffling it. If the answer is
"nothing", say that and stop: silence is a valid output. If something is uncertain,
the uncertainty belongs in step 1, not buried at the end.`;

/** How a weekly lookahead is shaped, whatever the body. */
export const WEEK_READ = `WHEN THEY ASK FOR THE WEEK (or a stretch of days): lead with the shape of it
in one line ("quiet until Thursday, then it stacks up"). Then one line per day
that carries something — a meeting, a deadline, travel, a collision — naming just
the thing that matters and any pressure on it. Skip empty days entirely; open
space gets named in the lead, not itemized. Close with the single thing worth
their attention, and only when something is genuinely waiting on them. The ceiling
is a ceiling: a light week answers in three lines and stops.`;

/** The failure shape, identical on every surface. */
export const FAILURE_SHAPE = `WHEN SOMETHING FAILS: say "Didn't run." then the reason in a person's words,
then "Nothing else changed." Then the one thing they can do — try again, or fix the thing first.
No apology loop, no error codes, no blaming them.`;

/** The depth block appended to a system prompt for one body. */
export function depthDirective(body: VantaBody): string {
  const d = BODY_DEPTH[body];
  const lines = [
    `${d.label} body: ${d.character}`,
    d.sentences[1] === 1
      ? `Length: one sentence.`
      : `Budget: up to ${d.sentences[1]} sentences — a ceiling, never a target. Say everything the answer needs; when two sentences cover it, stop at two. Never drop a fact that changes the decision to stay short.`,
    d.lists
      ? `Short lists are fine for two or three items; a week gets one line per day that carries something, up to seven. Never headings, never markdown tables.`
      : `No lists, no markdown. One line of prose.`,
    d.sources === "named"
      ? `Name every source you read it off, with how fresh it is.`
      : d.sources === "one"
        ? `Name one source — the one that matters — and how fresh it is.`
        : `Don't list sources. Say the fact.`,
    d.link ? `End with the way in when there is somewhere to go.` : `No links.`,
    d.next ? `End with the next step only when something is waiting on them.` : `No next step.`,
    `Short does not mean flat: the brevity is the accent, not the absence of one.`,
    `Compression drops detail, never meaning, and never the uncertainty.`,
  ];
  return `RESPONSE DEPTH (this reply is being read on a ${d.label.toLowerCase()}):\n${lines.join("\n")}\n\n${ANSWER_ORDER}\n\n${WEEK_READ}\n\n${FAILURE_SHAPE}`;
}

/** Split prose into sentences without mangling decimals or abbreviations. */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .filter(Boolean);
}

/**
 * Deterministic trim for templated lines (notices, receipts, reminders) that are
 * composed in code rather than by a model. It only removes whole sentences from
 * the end — it never rewrites, so a fact can't change on the way down a body.
 */
export function fitToBody(text: string, body: VantaBody): string {
  const max = BODY_DEPTH[body].sentences[1];
  const parts = sentencesOf(text);
  if (parts.length <= max) return parts.join(" ");
  return parts.slice(0, max).join(" ");
}

/** True when the smaller form says nothing the larger one didn't. */
export function depthAgrees(full: string, shorter: string): boolean {
  const words = (s: string) =>
    s.toLowerCase().replace(/…/g, " ").split(/[^a-z0-9']+/).filter((w) => w.length > 3);
  const known = new Set(words(full));
  return words(shorter).every((w) => known.has(w));
}

/**
 * The one bridge between the semantic depth model (bodies) and the renderer
 * that actually drops sentences (awareness/compress.ts verbosity). Anything
 * that needs to know "how much do I say here" asks for a body and comes here;
 * nobody picks a verbosity by hand.
 */
export const VERBOSITY_FOR_BODY: Record<VantaBody, Verbosity> = {
  desk: "rich",
  phone: "brief",
  telegram: "brief",
  wrist: "signal",
  spoken: "spoken",
};

export function verbosityForBody(body: VantaBody): Verbosity {
  return VERBOSITY_FOR_BODY[body];
}

/** Which body a delivery channel speaks through. */
export function bodyForChannel(channel: CommunicationChannel | string): VantaBody {
  switch (channel) {
    case "today":
    case "silent":
      return "desk";
    case "messaging":
      return "telegram";
    case "phone":
      return "phone";
    case "wearable":
      return "wrist";
    case "voice":
      return "spoken";
    default:
      return "desk";
  }
}
