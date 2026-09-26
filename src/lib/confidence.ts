// confidence — uncertainty is a fact on the card, not a secret in a tooltip.
//
// Doctrine:
//   - a direct read looks normal ("Read from calendar", "From Telegram")
//   - an inference reads as an inference ("Likely related to Lamai rollout")
//   - weak evidence says so out loud ("Uncertain — needs review")
//   - Echo never rounds a guess up into a fact
//
// Pure module. Confidence values come from records that already store them.

export type ReadKind = "read" | "inferred";

export type ConfidenceBand = "certain" | "likely" | "uncertain";

/** Bands are deliberately coarse. Percentages are not a user-facing idea. */
export function confidenceBand(confidence: number | null | undefined): ConfidenceBand {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return "uncertain";
  if (confidence >= 0.85) return "certain";
  if (confidence >= 0.55) return "likely";
  return "uncertain";
}

const SOURCE_PHRASE: Record<string, string> = {
  telegram: "From Telegram",
  whatsapp: "From WhatsApp",
  email: "From email",
  email_inbound: "From email",
  calendar: "Read from calendar",
  upload: "From an upload",
  website: "From a form",
  you: "Added by you",
  ask: "Created with Echo",
  sherlock: "Found by Sherlock",
  vanta: "Prepared by Echo",
};

/** The plain line for something Echo read directly. */
export function readLine(source: string | null | undefined): string | null {
  if (!source) return null;
  return SOURCE_PHRASE[source.trim().toLowerCase()] ?? null;
}

/**
 * The plain line for something Echo worked out. `about` is the thing it thinks
 * this relates to; omit it and the line stays honest but general.
 */
export function inferredLine(
  confidence: number | null | undefined,
  about?: string | null,
): string {
  const band = confidenceBand(confidence);
  if (band === "uncertain") return "Uncertain — needs review";
  if (band === "likely") return about ? `Likely related to ${about}` : "Likely related";
  return about ? `Echo linked this to ${about}` : "Worked out by Echo";
}

export type ConfidenceNote = {
  kind: ReadKind;
  band: ConfidenceBand;
  text: string;
  /** True when the user should look before trusting it. */
  needsReview: boolean;
};

/**
 * One call, one honest line. `source` present with kind "read" wins; otherwise
 * the inference wording is used.
 */
export function describeRead(input: {
  kind: ReadKind;
  source?: string | null;
  confidence?: number | null;
  about?: string | null;
}): ConfidenceNote | null {
  if (input.kind === "read") {
    const text = readLine(input.source);
    if (!text) return null;
    return { kind: "read", band: "certain", text, needsReview: false };
  }
  const band = confidenceBand(input.confidence);
  return {
    kind: "inferred",
    band,
    text: inferredLine(input.confidence, input.about),
    needsReview: band === "uncertain",
  };
}
