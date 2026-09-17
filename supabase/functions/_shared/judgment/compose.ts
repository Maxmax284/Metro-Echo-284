// compose — street-smart answer shape, without cosplay.
//
// Doctrine:
//   - Conclusion first. The person is on the move; they do not want a preamble.
//   - Then the practical tradeoff or the context that changes the decision.
//   - Then at most one next move, and only when it genuinely helps.
//   - Provenance sits behind "Why this?" or one plain source line. Never a
//     paragraph of citations.
//   - Street smart means practical judgement, not slang. No cosplay, no swagger,
//     no exclamation marks.
//   - Silence is a valid answer: nothing to say returns nothing.
//
// Pure module.

export type StreetAnswer = {
  /** The answer, first, in one sentence. */
  conclusion?: string | null;
  /** What it costs, what it trades, what changes the call. */
  tradeoff?: string | null;
  /** One thing worth doing. Omitted unless it helps. */
  nextMove?: string | null;
  /** One plain source line, shown behind "Why this?". */
  provenance?: string | null;
  /** What could not be established. Said plainly rather than smoothed over. */
  unknown?: string[] | null;
};

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.replace(/!+$/, ".");
};

/** The shape, assembled. Empty in, empty out — silence stays valid. */
export function streetAnswer(answer: StreetAnswer): string {
  const conclusion = clean(answer.conclusion);
  const tradeoff = clean(answer.tradeoff);
  const nextMove = clean(answer.nextMove);
  const unknown = (answer.unknown ?? []).map((u) => clean(u)).filter(Boolean) as string[];
  const parts: string[] = [];
  if (conclusion) parts.push(conclusion);
  if (tradeoff) parts.push(tradeoff);
  if (unknown.length) parts.push(`Not known: ${unknown.join("; ")}.`);
  if (nextMove) parts.push(nextMove);
  return parts.join(" ").trim();
}

/** The reveal line, kept out of the answer body. */
export function whyLine(answer: StreetAnswer): string | null {
  return clean(answer.provenance);
}

/** Prompt directive. Tunes composition without inventing a mode. */
export const STREET_ANSWER_RULES = [
  "When a situation has real tradeoffs, answer in this shape:",
  "1. The conclusion in one sentence.",
  "2. The tradeoff or the context that changes the call — what the cheap option actually costs, what the fast one costs.",
  "3. One next move, only if it genuinely helps. Otherwise stop.",
  "4. Source and freshness behind Why this?, never in the body.",
  "Do not force that shape onto simple questions. Do not perform street slang — practical judgement is the point, not the accent.",
  "Never state a preference as a fact. Say what is unknown instead of estimating it.",
  "If nothing needs saying, say nothing.",
].join("\n");
