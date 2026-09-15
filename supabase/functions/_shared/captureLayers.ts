// captureLayers — the layered truth of a capture.
//
// PRODUCT LAW: CAPTURE FIRST. INTERPRET SECOND. NEVER REWRITE THE ORIGINAL EVIDENCE.
// PRODUCT LAW: EXTRACTION IS NOT EXECUTION.
//
// A capture keeps four layers side by side, never on top of each other:
//   raw          — exactly what was typed, dictated or transcribed
//   clean        — a readable version, derived, replaceable, never authoritative
//   mattered     — what Echo believes mattered (decisions / promises / follow-ups /
//                  open questions / possible next steps)
//   connections  — what it was about (project, person, situation, appointment)
//
// Everything here is pure. Nothing in this module writes, stages, approves or
// executes anything. Follow-ups leave here as PROPOSALS only.

export const CAPTURE_LAW = {
  raw: "CAPTURE FIRST. INTERPRET SECOND. NEVER REWRITE THE ORIGINAL EVIDENCE.",
  extraction: "EXTRACTION IS NOT EXECUTION.",
} as const;

export type CaptureMode = "typed" | "dictated" | "conversation";

/** The evidence. Written once, never edited. */
export type RawCapture = {
  text: string;
  mode: CaptureMode;
  captured_at: string;
  duration_seconds?: number;
  locale?: string;
  /** Pointer to a stored recording, when the surface actually kept one. */
  recording_ref?: string | null;
  /** True when the words came off the device, not a server. */
  transcribed_locally?: boolean;
};

export type CleanNote = {
  text: string;
  /** "rules" = deterministic tidy-up here. "echo" = a model wrote it. */
  source: "rules" | "echo";
  at: string;
};

export type WhatMattered = {
  decisions: string[];
  commitments: string[];
  followUps: string[];
  questions: string[];
  possibleActions: string[];
};

export type CaptureConnections = {
  projectId?: string | null;
  projectLabel?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  threadId?: string | null;
  threadLabel?: string | null;
  calendarEventId?: string | null;
  calendarLabel?: string | null;
};

export type CaptureLayers = {
  version: 1;
  raw: RawCapture;
  clean: CleanNote | null;
  mattered: WhatMattered | null;
  connections: CaptureConnections;
};

export const EMPTY_MATTERED: WhatMattered = {
  decisions: [], commitments: [], followUps: [], questions: [], possibleActions: [],
};

export function newLayers(raw: RawCapture): CaptureLayers {
  return { version: 1, raw, clean: null, mattered: null, connections: {} };
}

/* ------------------------------------------------------------------ *
 * Raw is immutable
 * ------------------------------------------------------------------ */

/**
 * Merge an interpretation onto existing layers. The raw layer of the EXISTING
 * record always wins — an incoming payload can never rewrite the evidence.
 */
export function mergeLayers(
  existing: CaptureLayers | null | undefined,
  incoming: Partial<Omit<CaptureLayers, "version" | "raw">> & { raw?: RawCapture },
): CaptureLayers {
  if (!existing) {
    if (!incoming.raw) throw new Error("A capture cannot exist without its raw layer.");
    return {
      version: 1,
      raw: incoming.raw,
      clean: incoming.clean ?? null,
      mattered: incoming.mattered ?? null,
      connections: incoming.connections ?? {},
    };
  }
  return {
    version: 1,
    // The law, in one line.
    raw: existing.raw,
    clean: incoming.clean === undefined ? existing.clean : incoming.clean,
    mattered: incoming.mattered === undefined ? existing.mattered : incoming.mattered,
    connections: { ...existing.connections, ...(incoming.connections ?? {}) },
  };
}

/** True when the evidence survived a round of interpretation untouched. */
export function isRawPreserved(before: CaptureLayers, after: CaptureLayers): boolean {
  return (
    before.raw.text === after.raw.text &&
    before.raw.mode === after.raw.mode &&
    before.raw.captured_at === after.raw.captured_at &&
    (before.raw.recording_ref ?? null) === (after.raw.recording_ref ?? null)
  );
}

/** Read layers back off a note's metadata blob. Null when there are none. */
export function layersFromMetadata(metadata: unknown): CaptureLayers | null {
  if (!metadata || typeof metadata !== "object") return null;
  const l = (metadata as { layers?: unknown }).layers;
  if (!l || typeof l !== "object") return null;
  const raw = (l as { raw?: RawCapture }).raw;
  if (!raw || typeof raw.text !== "string") return null;
  const cast = l as CaptureLayers;
  return {
    version: 1,
    raw,
    clean: cast.clean ?? null,
    mattered: cast.mattered ?? null,
    connections: cast.connections ?? {},
  };
}

/* ------------------------------------------------------------------ *
 * Clean note — deterministic tidy-up, never a rewrite of meaning
 * ------------------------------------------------------------------ */

const FILLERS = [
  /\b(?:um+|uh+|erm+|ah+)\b[,.]?\s*/gi,
  /\byou know\b[,.]?\s*/gi,
  /\bi mean\b[,.]?\s*/gi,
  /\bsort of\b\s*/gi,
  /\bkind of\b\s*/gi,
];

/**
 * Readable version of a transcript: filler out, spacing normalised, sentences
 * capitalised, one blank line between paragraphs. No words are invented and no
 * sentence is reordered — this is legibility, not interpretation.
 */
export function cleanTranscript(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  for (const re of FILLERS) t = t.replace(re, "");
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  // Capitalise the first letter of each sentence without touching the rest.
  t = t.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  return t;
}

/* ------------------------------------------------------------------ *
 * What mattered — deterministic extraction
 * ------------------------------------------------------------------ */

const DECISION = /\b(we (?:decided|agreed)|decided to|agreed to|let'?s go with|we'?re going with|settled on|final(?:ised|ized)|the plan is)\b/i;
const COMMITMENT = /\b(i'?ll\b|i will\b|i'?m going to\b|we'?ll\b|we will\b|i promise|i can have|i'?ll get)\b/i;
const FOLLOW_UP = /\b(follow up|followup|circle back|check back|get back to|chase|remind me|need to|needs to|we should|i should|action item|to-?do)\b/i;
const OPEN_QUESTION = /\b(not sure|unclear|open question|still deciding|tbd|to be decided|don'?t know yet|need to find out)\b/i;
const POSSIBLE_ACTION = /\b(book|schedule|reschedule|email|call|text|send|pay|invoice|order|cancel|confirm|sign)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/**
 * Classify each sentence into at most one bucket. Rules only — no model, no
 * network, no guessing beyond the words that are actually there.
 */
export function extractSignals(text: string): WhatMattered {
  const out: WhatMattered = { decisions: [], commitments: [], followUps: [], questions: [], possibleActions: [] };
  for (const s of sentences(text)) {
    if (s.endsWith("?") || OPEN_QUESTION.test(s)) { push(out.questions, s); continue; }
    if (DECISION.test(s)) { push(out.decisions, s); continue; }
    if (COMMITMENT.test(s)) { push(out.commitments, s); continue; }
    if (FOLLOW_UP.test(s)) { push(out.followUps, s); continue; }
    if (POSSIBLE_ACTION.test(s)) { push(out.possibleActions, s); continue; }
  }
  return out;
}

function push(list: string[], s: string) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean && !list.includes(clean) && list.length < 12) list.push(clean);
}

export function matteredCount(m: WhatMattered | null | undefined): number {
  if (!m) return 0;
  return m.decisions.length + m.commitments.length + m.followUps.length + m.questions.length + m.possibleActions.length;
}

export function hasFollowUp(m: WhatMattered | null | undefined): boolean {
  if (!m) return false;
  return m.commitments.length + m.followUps.length + m.possibleActions.length > 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What Echo says after a capture stops. Silence is a real answer: nothing
 * actionable gets the short line, not an invented list.
 */
export function captureVerdict(m: WhatMattered | null | undefined): string {
  if (!m || matteredCount(m) === 0) return "Saved. Nothing needs follow-up.";
  const parts: string[] = [];
  if (m.decisions.length) parts.push(plural(m.decisions.length, "decision", "decisions"));
  const follow = m.commitments.length + m.followUps.length;
  if (follow) parts.push(plural(follow, "follow-up", "follow-ups"));
  if (m.questions.length) parts.push(plural(m.questions.length, "open question", "open questions"));
  if (!parts.length && m.possibleActions.length) {
    parts.push(plural(m.possibleActions.length, "possible next step", "possible next steps"));
  }
  if (!parts.length) return "Saved. Nothing needs follow-up.";
  const said = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Got it. I found ${said}.`;
}

/* ------------------------------------------------------------------ *
 * Proposals — extraction is not execution
 * ------------------------------------------------------------------ */

export type FollowUpProposal = {
  id: string;
  text: string;
  /** Where it would land IF the person approves it. */
  destination: "commitment" | "action";
  /** Always "proposed". There is no other value; nothing here can execute. */
  status: "proposed";
  requiresApproval: true;
  /** Which layer produced it, so a card can say so honestly. */
  from: "commitments" | "followUps" | "possibleActions";
};

/**
 * Turn extracted signals into things Echo may OFFER. A proposal is inert: it
 * carries no side effect and cannot be marked executed from this module.
 */
export function followUpProposals(m: WhatMattered | null | undefined): FollowUpProposal[] {
  if (!m) return [];
  const out: FollowUpProposal[] = [];
  const add = (text: string, from: FollowUpProposal["from"], destination: FollowUpProposal["destination"]) => {
    out.push({ id: `${from}:${out.length}`, text, destination, status: "proposed", requiresApproval: true, from });
  };
  m.commitments.forEach((t) => add(t, "commitments", "commitment"));
  m.followUps.forEach((t) => add(t, "followUps", "commitment"));
  m.possibleActions.forEach((t) => add(t, "possibleActions", "action"));
  return out.slice(0, 10);
}

/** The offer line under a capture. Never a confirmation that something happened. */
export function proposalOffer(proposals: FollowUpProposal[]): string | null {
  if (!proposals.length) return null;
  return `Add ${plural(proposals.length, "follow-up", "follow-ups")} to Work? Nothing moves until you say yes.`;
}

/** A short title for a capture, taken from its own words. Never invented. */
export function captureTitle(text: string, mode: CaptureMode): string {
  const first = sentences(text)[0] ?? text.trim();
  const trimmed = first.replace(/\s+/g, " ").slice(0, 60).trim();
  if (trimmed) return trimmed;
  return mode === "conversation" ? "Conversation capture" : "Note";
}

export const MODE_WORDS: Record<CaptureMode, { label: string; help: string }> = {
  typed: { label: "Type", help: "You write it. Echo stays out of the way." },
  dictated: { label: "Dictate", help: "You talk, Echo writes it down. It does not answer." },
  conversation: { label: "Capture conversation", help: "Echo stays quiet and records. It structures it after you stop." },
};
