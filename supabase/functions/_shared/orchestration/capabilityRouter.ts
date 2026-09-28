// Capability router — one place that decides which methods a request needs.
//
// Pure decision only: it never calls a model, a provider, or the database. It
// answers "what should happen", so no surface grows its own routing logic.
// It can never authorize execution — at most it says an action may be *prepared*.

import type { PerceptionInput, PerceptionJob, Confidence } from "./perception.ts";
import type { ResearchDepth, ResearchIntent } from "./research.ts";
import { depthForIntent } from "./research.ts";
import { escalationFor, type Escalation } from "./sherlockEscalation.ts";
import type { Verbosity } from "../awareness/compress.ts";
import { fieldCapability, fieldIntentFor, isHighStakes, type FieldMatch } from "../fieldIntent.ts";

/** Capability families. Never exposed to the user as a menu. */
export type CapabilityFamily =
  | "text_understanding"
  | "ocr"
  | "document_extraction"
  | "object_identification"
  | "barcode"
  | "internal_retrieval"
  | "web_lookup"
  | "web_investigation"
  | "comparison"
  | "source_verification"
  | "sherlock"
  | "summarization"
  | "action_preparation"
  /** Trip/walk session words. Writes only the session the person asked for. */
  | "field_session"
  /** High-stakes language. Simplify and offer help; never act alone. */
  | "safety_handoff";

export type RetrievalTarget = "memory" | "projects" | "documents" | "commitments" | "receipts" | "calendar";

export type Scope = "personal" | "organization" | "admin";

export interface RouteRequest {
  text: string;
  attachments?: PerceptionInput[];
  scope: Scope;
  organization_id?: string | null;
  /** Where the answer will be read; drives compression, not content. */
  verbosity?: Verbosity;
  /** Private names/terms available for sanitization downstream. */
  private_names?: string[];
}

export interface RoutePlan {
  perception: PerceptionJob[];
  retrieval: RetrievalTarget[];
  research: { intent: ResearchIntent; depth: ResearchDepth } | null;
  sherlock: boolean;
  escalation: Escalation;
  capabilities: CapabilityFamily[];
  /** Confidence the answer must reach before it is stated plainly. */
  min_confidence: Confidence;
  verbosity: Verbosity;
  /** An action may be drafted and staged. Never executed from here. */
  may_prepare_action: boolean;
  /** Every artifact this plan produces inherits these. */
  scope: Scope;
  organization_id: string | null;
  /**
   * Field phrases ("walk with me", "I'm here", "SOS"). Recognized here so Ask
   * and Telegram understand the same sentence — no surface-local regexes.
   */
  field: FieldMatch | null;
  /** Echo gets shorter, plainer and quieter. Never chattier, never automatic. */
  high_stakes: boolean;
}

const RESEARCH_PHRASES: Array<{ re: RegExp; intent: ResearchIntent }> = [
  { re: /\b(monitor|watch for|keep an eye on|track changes)\b/i, intent: "monitor" },
  { re: /\b(verify|fact.?check|is this (true|correct|current|genuine))\b/i, intent: "verify" },
  { re: /\b(research|investigate|dig into|go deeper)\b/i, intent: "investigate" },
  { re: /\b(compare|which (one|laptop|option)|versus|vs\.?)\b/i, intent: "compare" },
  { re: /\b(what changed|explain what|why did .* change)\b/i, intent: "explain" },
  { re: /\b(look ?up|find the manual|what time does|price of|spec(s|ification)s?)\b/i, intent: "lookup" },
  /* Current-events phrasing is a live lookup, never a memory answer. Kept
     tight on purpose: "update on the project" stays internal. */
  { re: /\b(what'?s going on (with|in)|what'?s happening (with|in)|what is happening (with|in)|latest (news|developments) (on|in|about))\b/i, intent: "lookup" },
];

const INTERNAL_PHRASES =
  /\b(we|our|what did (we|i)|already|prior|previous|last time|this project|decided|decision|earlier)\b/i;

const PREPARE_PHRASES =
  /\b(draft|write|prepare|stage|set up a|remind me|add a commitment|follow.?up|schedule)\b/i;

function retrievalFor(text: string, hasAttachment: boolean, internal: boolean): RetrievalTarget[] {
  const out = new Set<RetrievalTarget>();
  if (internal) {
    out.add("memory");
    out.add("projects");
  }
  if (/\b(document|contract|invoice|agreement|draft)\b/i.test(text) || hasAttachment) out.add("documents");
  if (/(promis|commit|owe|deadline|due)/i.test(text)) out.add("commitments");
  if (/(decid|decision|what happened|receipt|audit|history)/i.test(text)) out.add("receipts");
  if (/\b(meeting|calendar|schedule|agenda)\b/i.test(text)) out.add("calendar");
  return [...out];
}

function capabilitiesFor(plan: Omit<RoutePlan, "capabilities">, attachments: PerceptionInput[]): CapabilityFamily[] {
  const out = new Set<CapabilityFamily>(["text_understanding"]);
  const kinds = new Set(attachments.map((a) => a.kind));
  if (plan.perception.includes("extract")) {
    if (kinds.has("image") || kinds.has("photo") || kinds.has("screenshot")) out.add("ocr");
    if (kinds.has("document") || kinds.has("file")) out.add("document_extraction");
  }
  if (plan.perception.includes("identify")) out.add("object_identification");
  if (kinds.has("barcode")) out.add("barcode");
  if (plan.retrieval.length) out.add("internal_retrieval");
  if (plan.research) {
    out.add(plan.research.depth === "deep" ? "web_investigation" : "web_lookup");
    if (plan.research.intent === "verify") out.add("source_verification");
    if (plan.research.intent === "compare") out.add("comparison");
  }
  if (plan.sherlock) out.add("sherlock");
  if (plan.verbosity !== "rich") out.add("summarization");
  if (plan.may_prepare_action) out.add("action_preparation");
  if (plan.field && fieldCapability(plan.field.intent).writes_session) out.add("field_session");
  if (plan.high_stakes) out.add("safety_handoff");
  return [...out];
}

/**
 * Retrieve first, reason second: when the question is about the user's own
 * world, internal retrieval is required and external research is optional.
 */
export function routeRequest(req: RouteRequest): RoutePlan {
  const text = String(req.text ?? "");
  const attachments = req.attachments ?? [];
  const hasAttachment = attachments.length > 0;
  const escalation = escalationFor(text, hasAttachment);
  const field = fieldIntentFor(text);
  const high_stakes = isHighStakes(field?.intent);

  const phrase = RESEARCH_PHRASES.find((p) => p.re.test(text));
  const intent = phrase?.intent ?? escalation.research;
  const research = intent ? { intent, depth: depthForIntent(intent) } : null;

  const internal = escalation.internal_retrieval || INTERNAL_PHRASES.test(text);
  const retrieval = retrievalFor(text, hasAttachment, internal);

  const min_confidence: Confidence =
    research?.intent === "verify" || escalation.sherlock ? "high" : "probable";

  const base: Omit<RoutePlan, "capabilities"> = {
    perception: escalation.perception,
    retrieval,
    research,
    sherlock: escalation.sherlock,
    escalation,
    min_confidence,
    /* High stakes forces the shortest form on every surface. Someone who says
       they don't feel safe does not need three paragraphs of personality. */
    verbosity: high_stakes ? "signal" : (req.verbosity ?? "rich"),
    may_prepare_action: PREPARE_PHRASES.test(text),
    scope: req.scope,
    organization_id: req.scope === "personal" ? null : (req.organization_id ?? null),
    field,
    high_stakes,
  };

  return { ...base, capabilities: capabilitiesFor(base, attachments) };
}

/** A route plan can never execute. Kept as an explicit, testable invariant. */
export function planMayExecute(_plan: RoutePlan): false {
  return false;
}
