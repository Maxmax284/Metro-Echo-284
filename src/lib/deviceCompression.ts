// deviceCompression — one set of facts, five bodies.
//
// The awareness layer already decides IF something is said and how much a channel
// carries. This module is the single place a wrist line, a spoken line or a haptic
// decision is produced from those facts, so wordings stop being retyped per surface.
//
// The law: compression removes detail, never meaning. Nothing appears at a smaller
// size that is absent at a larger one. Pure module — no IO, no React.
import { compressNotice, type NoticeFacts } from "@/lib/awareness";

/** How much a notice is asking of the person. */
export type Urgency = "fyi" | "meaningful" | "needs_you" | "critical";

export const URGENCY_RANK: Record<Urgency, number> = {
  fyi: 0,
  meaningful: 1,
  needs_you: 2,
  critical: 3,
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  fyi: "For info",
  meaningful: "Changed",
  needs_you: "Needs you",
  critical: "Critical",
};

export interface DeviceForms {
  /** Headline, every fact, the next step, the link. */
  desk: string;
  /** Headline, facts, next step. */
  phone: string;
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

/** Render every body from one set of facts. */
export function renderForms(facts: NoticeFacts, urgency: Urgency = "meaningful"): DeviceForms {
  return {
    desk: compressNotice(facts, "rich"),
    phone: compressNotice(facts, "brief"),
    wrist: wristLine(facts),
    spoken: compressNotice(facts, "spoken"),
    hapticOnly: URGENCY_RANK[urgency] <= URGENCY_RANK.meaningful,
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

  const wristOk = words(forms.wrist).every((w) => known.has(w) || desk.includes(w));
  const phoneOk = words(forms.phone).every((w) => known.has(w) || desk.includes(w));
  const spokenOk = words(forms.spoken).every(
    (w) => known.has(w) || desk.includes(w) || spokenExtras.has(w),
  );
  return wristOk && phoneOk && spokenOk;
}
