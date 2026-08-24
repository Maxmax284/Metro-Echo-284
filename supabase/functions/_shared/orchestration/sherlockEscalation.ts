// Sherlock escalation contract.
//
// Sherlock is not a separate brain; it is the deep end of the same pipeline.
// This module maps natural phrasing onto capability sets, so no caller invents
// its own escalation rules.

import type { PerceptionJob } from "./perception.ts";
import type { ResearchIntent } from "./research.ts";

export type EscalationLevel =
  | "perception_only"
  | "perception_context"
  | "perception_sherlock"
  | "full_investigation";

export interface Escalation {
  level: EscalationLevel;
  perception: PerceptionJob[];
  /** Retrieve internal records before reasoning. */
  internal_retrieval: boolean;
  research: ResearchIntent | null;
  sherlock: boolean;
}

const RULES: Array<{ re: RegExp; level: EscalationLevel }> = [
  { re: /\bsherlock\b/i, level: "full_investigation" },
  { re: /\b(verify|is this (genuine|real|correct|current)|fact.?check)\b/i, level: "full_investigation" },
  { re: /\b(anything (unusual|off|wrong)|is anything wrong|look for anomal)/i, level: "perception_sherlock" },
  { re: /\b(compare|differ|changed since|against what we|versus)\b/i, level: "perception_context" },
  { re: /\b(explain|what does this mean|why does this matter)\b/i, level: "perception_context" },
  { re: /\b(read|ocr|extract|what does (it|this) say|transcribe)\b/i, level: "perception_only" },
  { re: /\b(identify|what (is|am i looking at)|what the hell is|what kind of)\b/i, level: "perception_only" },
];

const BASE: Record<EscalationLevel, Omit<Escalation, "perception">> = {
  perception_only: { level: "perception_only", internal_retrieval: false, research: null, sherlock: false },
  perception_context: { level: "perception_context", internal_retrieval: true, research: null, sherlock: false },
  perception_sherlock: { level: "perception_sherlock", internal_retrieval: true, research: null, sherlock: true },
  full_investigation: { level: "full_investigation", internal_retrieval: true, research: "verify", sherlock: true },
};

/** Decide how deep a request goes. Pure; calls nothing. */
export function escalationFor(request: string, hasAttachment: boolean): Escalation {
  const text = String(request ?? "");
  const match = RULES.find((r) => r.re.test(text));
  const level = match?.level ?? (hasAttachment ? "perception_only" : "perception_context");
  const base = BASE[level];

  const perception: PerceptionJob[] = [];
  if (hasAttachment) {
    if (/\b(identify|what (is|am i looking at)|what the hell is|what kind of)\b/i.test(text)) {
      perception.push("identify");
    }
    if (/\b(read|ocr|extract|what does (it|this) say|transcribe|total|invoice|receipt)\b/i.test(text) || !perception.length) {
      perception.push("extract");
    }
    if (level !== "perception_only") perception.push("interpret");
  }

  return { ...base, perception };
}
