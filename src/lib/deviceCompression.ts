// deviceCompression — the thin adapter between one set of facts and the body
// reading them.
//
// It owns nothing on its own any more. Depth (how much gets said) belongs to
// responseDepth.ts; urgency (how much this matters) belongs to the awareness
// ladder. This file only renders.
//
// The law: compression removes detail, never meaning. Nothing appears at a
// smaller size that is absent at a larger one. Pure module — no IO, no React.
import { compressNotice, type NoticeFacts } from "@/lib/awareness";
import { URGENCY_ORDER, urgencyRank, type Urgency } from "@/lib/awareness";
import { verbosityForBody, type VantaBody } from "@/lib/responseDepth";

export type { Urgency, VantaBody };
export { URGENCY_ORDER };

/** Rank lookup kept for the surfaces that compare thresholds inline. */
export const URGENCY_RANK: Record<Urgency, number> = URGENCY_ORDER.reduce(
  (acc, u) => ({ ...acc, [u]: urgencyRank(u) }),
  {} as Record<Urgency, number>,
);

/** What a person would call each rung. No internal words on screen. */
export const URGENCY_LABEL: Record<Urgency, string> = {
  background: "Recorded",
  useful: "For info",
  attention: "Changed",
  time_sensitive: "Needs you",
  critical: "Critical",
};

export interface DeviceForms {
  /** Headline, every fact, the next step, the link. */
  desk: string;
  /** Headline, facts, next step. */
  phone: string;
  /** The pocket form — same facts, fewer of them. */
  telegram: string;
  /** Headline plus at most one fact. */
  wrist: string;
  /** One sentence, offering the rest instead of dumping it. */
  spoken: string;
  /** True when a buzz alone is honest: nothing is waiting on the person. */
  hapticOnly: boolean;
}

/** Shorten a wrist headline without inventing words. Cuts at a word boundary. */
export function wristHeadline(title: string, max = 46): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 12 ? cut.slice(0, space) : cut).replace(/[.,;:·-]+$/, "")}…`;
}

/** The one line a wrist gets: headline, and one fact only if it fits. */
export function wristLine(facts: NoticeFacts): string {
  const head = wristHeadline(facts.title);
  const first = (facts.lines ?? []).map((l) => String(l ?? "").trim()).find(Boolean);
  if (!first) return head;
  const fact = wristHeadline(first, 40);
  return `${head}\n${fact}`;
}

/** Render one body from one set of facts. Wrist has its own line budget. */
export function renderBody(facts: NoticeFacts, body: VantaBody): string {
  if (body === "wrist") return wristLine(facts);
  return compressNotice(facts, verbosityForBody(body));
}

/** Render every body from one set of facts. */
export function renderForms(facts: NoticeFacts, urgency: Urgency = "attention"): DeviceForms {
  return {
    desk: renderBody(facts, "desk"),
    phone: renderBody(facts, "phone"),
    telegram: renderBody(facts, "telegram"),
    wrist: renderBody(facts, "wrist"),
    spoken: renderBody(facts, "spoken"),
    hapticOnly: urgencyRank(urgency) <= urgencyRank("attention"),
  };
}

/**
 * Consistency guard. Every smaller form must be traceable to the desk form:
 * the wrist may drop words, never add them. Used by the tests and safe to call
 * in development when a new caller invents its own copy.
 */
export function formsAgree(forms: DeviceForms): boolean {
  const desk = forms.desk.toLowerCase();
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/…/g, " ")
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length > 3);

  const known = new Set(words(desk));
  // "want the rest" is the spoken layer's own offer, not a claim about the facts.
  const spokenExtras = new Set(["want", "rest", "detail"]);

  const traceable = (s: string, extras?: Set<string>) =>
    words(s).every((w) => known.has(w) || desk.includes(w) || (extras?.has(w) ?? false));

  return (
    traceable(forms.wrist) &&
    traceable(forms.phone) &&
    traceable(forms.telegram) &&
    traceable(forms.spoken, spokenExtras)
  );
}
