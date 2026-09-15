// crossSource — many sources, one situation.
//
// Doctrine:
//   - A calendar entry, an email and a file that belong to the same thing are
//     ONE situation. Echo says the conclusion; the sources sit behind it.
//   - A new fact modifies an existing situation before it is allowed to become
//     a second one. Nothing arrives and starts its own pile.
//   - Deterministic. No model runs in here. Every link names the recorded
//     reason it was made, so "Why this?" can be answered from the record.
//   - Mail is headers and snippets only. Files are names only. Nothing here
//     opens a body or a document.
//   - A fact that is not written down is left out. Echo does not fill gaps.
//
// Pure module: no IO, no React, no Deno APIs.

import { labelSimilarity } from "./crossref.ts";

export type CrossKind = "calendar" | "commitment" | "mail" | "file" | "change";

/** One recorded fact from one source. Nothing derived, nothing guessed. */
export type CrossFact = {
  id: string;
  kind: CrossKind;
  /** Event title, commitment summary, mail subject or file name, as recorded. */
  title: string;
  /** ISO time of the fact itself: start, due, mail date, file modified. */
  at: string | null;
  /** Who sent it, when the source records a sender. Mail only. */
  from?: string | null;
  /** Headers and snippets only — never a full body or a document's contents. */
  text?: string | null;
  /** Project label already recorded on the row. */
  project?: string | null;
  /** Address recorded on the row. Calendar only. */
  location?: string | null;
  /** Where a person can go to look at it themselves. */
  link?: string | null;
};

/** Why one fact was attached to another. Recorded reasons only. */
export type LinkReason =
  | "names_it"
  | "same_project"
  | "same_day"
  | "carries_address"
  | "says_it_moved";

const REASON_WORDS: Record<LinkReason, string> = {
  names_it: "It names the same thing.",
  same_project: "It is filed to the same project.",
  same_day: "It landed about the same time.",
  carries_address: "It carries an address for it.",
  says_it_moved: "It says the time changed.",
};

export type CrossLink = {
  fact: CrossFact;
  reason: LinkReason;
  /** Plain English, for the reveal. */
  why: string;
  /** 0..1. Never shown to a person — it only orders and grades. */
  strength: number;
};

export type CrossConfidence = "clear" | "likely" | "thin";

export type CrossSituation = {
  /** The thing the situation is about: a calendar entry or a promise. */
  anchor: CrossFact;
  /** Supporting facts, strongest first. At most three carry into words. */
  links: CrossLink[];
  /** One sentence. Conclusion first, no source-by-source recital. */
  conclusion: string;
  /** One line per contributing fact, for "Why this?". */
  provenance: string[];
  /** Words, never a score. */
  confidence: CrossConfidence;
  /** An address written in a supporting fact, when one really was. */
  newAddress: string | null;
  /** True only when a supporting fact plainly says the time changed. */
  timeChanged: boolean;
};

const DAY = 86_400_000;
const NAME_SURE = 0.62;

const MOVED_RE =
  /\b(reschedul\w*|moved to|has moved|been moved|new time|time change[d]?|postpon\w*|rebook\w*|brought forward|pushed back)\b/i;
const RELOCATED_RE = /\b(new (?:address|location)|relocat\w*|now at|has moved to|new office|new clinic)\b/i;
const STREET_RE =
  /\b\d{1,6}\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Suite|Ste|Floor|Fl|Unit)\b\.?(?:[,\s]+(?:Suite|Ste|Unit|Floor|Fl)\s*[\w-]+)?/;

/** A street address written in recorded text, or nothing. Never invented. */
export function readAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const hit = STREET_RE.exec(text);
  if (!hit) return null;
  const found = hit[0].replace(/\s+/g, " ").trim();
  return found.length >= 8 ? found : null;
}

/** True when the text itself says the time moved. Wording, not inference. */
export function saysItMoved(text: string | null | undefined): boolean {
  return MOVED_RE.test(text ?? "");
}

/** True when the text itself announces a new address. */
export function saysNewAddress(text: string | null | undefined): boolean {
  return RELOCATED_RE.test(text ?? "");
}

/** Comparable words in a title: no filler, no punctuation. */
const FILLER = /\b(the|a|an|my|your|re|fwd|reminder|appt|appointment|meeting|call|your)\b/gi;
function core(title: string): string {
  return (title ?? "").replace(FILLER, " ").replace(/\s+/g, " ").trim();
}

/**
 * Does a supporting fact name the anchor? Compares the meaningful words of
 * both, so "Re: ADHD appointment Thursday" reaches "ADHD appointment".
 */
export function namesTheSameThing(anchorTitle: string, factText: string): number {
  const a = core(anchorTitle);
  if (a.length < 3) return 0;
  const b = core(factText);
  if (!b) return 0;
  const direct = labelSimilarity(a, b);
  /* A long subject line dilutes token overlap, so a straight containment of
     the anchor's own words counts on its own merits. */
  const contained = b.toLowerCase().includes(a.toLowerCase()) ? 0.9 : 0;
  return Math.max(direct, contained);
}

function withinDays(a: string | null, b: string | null, days: number): boolean {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= days * DAY;
}

/**
 * How a single supporting fact relates to a single anchor, or nothing at all.
 * The strongest recorded reason wins; weak coincidence is not a relationship.
 */
export function linkFor(anchor: CrossFact, fact: CrossFact): CrossLink | null {
  if (fact.id === anchor.id) return null;
  const haystack = [fact.title, fact.text].filter(Boolean).join(" ");
  const named = namesTheSameThing(anchor.title, haystack);

  const candidates: CrossLink[] = [];

  if (named >= NAME_SURE) {
    candidates.push({ fact, reason: "names_it", why: REASON_WORDS.names_it, strength: Math.min(1, named) });
  }

  if (anchor.project && fact.project && anchor.project === fact.project) {
    candidates.push({ fact, reason: "same_project", why: REASON_WORDS.same_project, strength: 0.7 });
  }

  /* Time-change and address only count when the fact already names the thing.
     An unrelated email that happens to contain a street is not a new address
     for your appointment. */
  if (named >= NAME_SURE) {
    if (saysItMoved(haystack)) {
      candidates.push({ fact, reason: "says_it_moved", why: REASON_WORDS.says_it_moved, strength: 0.95 });
    }
    if (readAddress(haystack) && (saysNewAddress(haystack) || fact.kind === "mail")) {
      candidates.push({ fact, reason: "carries_address", why: REASON_WORDS.carries_address, strength: 0.9 });
    }
  }

  /* Same-day proximity is the weakest reason there is, and it only stands when
     something else already ties them loosely together. */
  if (candidates.length === 0 && named >= 0.35 && withinDays(anchor.at, fact.at, 2)) {
    candidates.push({ fact, reason: "same_day", why: REASON_WORDS.same_day, strength: 0.4 });
  }

  return candidates.sort((a, b) => b.strength - a.strength)[0] ?? null;
}

function sourceWord(kind: CrossKind): string {
  switch (kind) {
    case "mail":
      return "an email";
    case "file":
      return "a file in Drive";
    case "change":
      return "a change on your calendar";
    case "commitment":
      return "a promise you made";
    default:
      return "your calendar";
  }
}

function fileClause(fact: CrossFact): string {
  return `the file you need — ${fact.title} — is in Drive`;
}

function mailClause(link: CrossLink): string {
  const who = (link.fact.from ?? "").trim();
  const from = who ? ` from ${who}` : "";
  switch (link.reason) {
    case "says_it_moved":
      return `an email${from} says the time changed`;
    case "carries_address":
      return `the address is in an email${from}`;
    default:
      return `there's an email${from} about it`;
  }
}

function clauseFor(link: CrossLink): string {
  if (link.fact.kind === "file") return fileClause(link.fact);
  if (link.fact.kind === "mail") return mailClause(link);
  if (link.fact.kind === "change") return "your calendar recorded a change to it";
  return `${link.fact.title} is tied to it`;
}

/** "Riverside intake form (Drive), modified yesterday" — recorded facts only. */
function provenanceLine(fact: CrossFact, why: string): string {
  const where =
    fact.kind === "mail"
      ? `Email${fact.from ? ` from ${fact.from}` : ""}: ${fact.title}`
      : fact.kind === "file"
        ? `Drive file: ${fact.title}`
        : `${sourceWord(fact.kind)}: ${fact.title}`;
  return `${where} — ${why}`;
}

function gradeOf(links: CrossLink[]): CrossConfidence {
  const best = links[0]?.strength ?? 0;
  if (best >= 0.85 && links.length >= 1) return "clear";
  if (best >= 0.6) return "likely";
  return "thin";
}

/**
 * Turn one anchor and its links into the sentence a person reads. At most three
 * clauses — past that it stops being a conclusion and becomes a report.
 */
export function concludeSituation(anchor: CrossFact, links: CrossLink[]): CrossSituation {
  const ranked = [...links].sort((a, b) => b.strength - a.strength);
  const used = ranked.slice(0, 3);
  const address = used.map((l) => readAddress([l.fact.title, l.fact.text].filter(Boolean).join(" "))).find(Boolean) ?? null;
  const moved = used.some((l) => l.reason === "says_it_moved");

  const clauses = used.map(clauseFor);
  const head = moved ? `${anchor.title} may have moved` : anchor.title;
  const tail =
    clauses.length === 0
      ? ""
      : clauses.length === 1
        ? ` — ${clauses[0]}`
        : ` — ${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;

  return {
    anchor,
    links: ranked,
    conclusion: `${head}${tail}.`,
    provenance: [
      provenanceLine(anchor, "This is the thing itself."),
      ...used.map((l) => provenanceLine(l.fact, l.why)),
    ],
    confidence: gradeOf(ranked),
    newAddress: address,
    timeChanged: moved,
  };
}

export type CrossInput = {
  /** Calendar entries and promises — the things a situation can be about. */
  anchors: CrossFact[];
  /** Mail headers, file names and recorded calendar changes. */
  supporting: CrossFact[];
  now?: number;
};

/**
 * Read every source as one board. Only anchors that actually gathered
 * supporting facts come back — a lone calendar entry is not a cross-source
 * situation and does not need this module to describe it.
 */
export function readCrossSituations(input: CrossInput): CrossSituation[] {
  const out: CrossSituation[] = [];
  for (const anchor of input.anchors) {
    const links: CrossLink[] = [];
    for (const fact of input.supporting) {
      const link = linkFor(anchor, fact);
      if (link) links.push(link);
    }
    if (links.length === 0) continue;
    out.push(concludeSituation(anchor, links));
  }
  /* Strongest situation first, so a caller that shows one shows the right one. */
  const grade: Record<CrossConfidence, number> = { clear: 0, likely: 1, thin: 2 };
  return out.sort(
    (a, b) => grade[a.confidence] - grade[b.confidence] || (b.links[0]?.strength ?? 0) - (a.links[0]?.strength ?? 0),
  );
}

/**
 * Which existing situation a brand-new fact belongs to. This is the rule that
 * keeps a new email from starting a second pile beside the appointment it is
 * about. Returns null only when nothing on the board claims it.
 */
export function absorbFact(
  fact: CrossFact,
  situations: CrossSituation[],
): { situation: CrossSituation; link: CrossLink } | null {
  let best: { situation: CrossSituation; link: CrossLink } | null = null;
  for (const situation of situations) {
    const link = linkFor(situation.anchor, fact);
    if (!link) continue;
    if (!best || link.strength > best.link.strength) best = { situation, link };
  }
  return best;
}

/** The same fact folded in, re-worded. The situation moves; it never clones. */
export function absorbInto(situation: CrossSituation, fact: CrossFact): CrossSituation {
  const link = linkFor(situation.anchor, fact);
  if (!link) return situation;
  const already = situation.links.some((l) => l.fact.id === fact.id);
  const links = already
    ? situation.links.map((l) => (l.fact.id === fact.id ? link : l))
    : [...situation.links, link];
  return concludeSituation(situation.anchor, links);
}

/** True when a situation is worth putting in front of somebody unasked. */
export function worthSaying(situation: CrossSituation): boolean {
  return situation.confidence !== "thin";
}
