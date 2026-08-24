// Perception seam — types and pure helpers for the three perception jobs.
//
// Perception is a capability layer, never a room. Extraction answers "what does
// this contain", identification answers "what am I looking at", interpretation
// answers "what does this mean here". Every result carries honest uncertainty:
// a partial answer always beats a confident wrong one.

/** The three distinct perception jobs. */
export type PerceptionJob = "extract" | "identify" | "interpret";

/** Confidence states. `unreadable` and `partial` are first-class outcomes. */
export type Confidence = "high" | "probable" | "uncertain" | "partial" | "unreadable";

/** Deliberate input families. Input method is not a product surface. */
export type PerceptionInputKind =
  | "text"
  | "file"
  | "document"
  | "image"
  | "screenshot"
  | "photo"
  | "audio"
  | "barcode";

export interface PerceptionInput {
  kind: PerceptionInputKind;
  /** Storage/DB reference, never raw bytes at this seam. */
  ref?: string | null;
  mime?: string | null;
  filename?: string | null;
}

/** A single extracted field, with its own confidence and unclear marker. */
export interface ExtractedField {
  key: string;
  value: string | null;
  confidence: Confidence;
  /** True when the field was seen but could not be read reliably. */
  unclear?: boolean;
}

/**
 * Hierarchical identification. Prefer the highest reliable level; never invent
 * an exact model to fill level 3.
 */
export interface IdentificationLevel {
  level: 1 | 2 | 3;
  label: string;
  confidence: Confidence;
  /** What in the input supports this label. */
  evidence?: string | null;
}

export interface PerceptionResult {
  job: PerceptionJob;
  input: PerceptionInput;
  /** Raw extracted text, kept separate from any interpretation. */
  text?: string | null;
  fields?: ExtractedField[];
  identification?: IdentificationLevel[];
  /** Plain-English reading of what this means in the user's context. */
  interpretation?: string | null;
  confidence: Confidence;
  /** Field keys or aspects the system could not resolve. */
  unresolved?: string[];
  /** Honest reason when quality was the limit ("photo is blurred"). */
  quality_note?: string | null;
  /** Scope is absolute; every artifact inherits the authoritative scope. */
  organization_id?: string | null;
}

const RANK: Record<Confidence, number> = {
  unreadable: 0,
  uncertain: 1,
  partial: 2,
  probable: 3,
  high: 4,
};

/** Lowest confidence wins: a result is only as strong as its weakest evidence. */
export function weakestConfidence(values: Confidence[]): Confidence {
  if (!values.length) return "uncertain";
  return values.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
}

/** True when the result is strong enough to state without hedging. */
export function isStatable(c: Confidence): boolean {
  return RANK[c] >= RANK.probable;
}

/** The best label we are allowed to say out loud. */
export function bestReliableIdentification(
  levels: IdentificationLevel[],
  min: Confidence = "probable",
): IdentificationLevel | null {
  const ok = levels.filter((l) => RANK[l.confidence] >= RANK[min]);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.level > a.level ? b : a));
}

/** Roll a field set up into one honest result confidence. */
export function summarizeExtraction(fields: ExtractedField[]): {
  confidence: Confidence;
  unresolved: string[];
} {
  const unresolved = fields.filter((f) => f.unclear || f.value === null).map((f) => f.key);
  if (!fields.length) return { confidence: "unreadable", unresolved };
  if (unresolved.length === fields.length) return { confidence: "unreadable", unresolved };
  if (unresolved.length) return { confidence: "partial", unresolved };
  return { confidence: weakestConfidence(fields.map((f) => f.confidence)), unresolved };
}

/**
 * A user correction never rewrites the observation — it lands beside it.
 * Evidence stays; the conclusion moves.
 */
export interface PerceptionCorrection {
  result_field?: string | null;
  was: string | null;
  now: string;
  corrected_at: string;
}

export function applyCorrection(
  result: PerceptionResult,
  correction: PerceptionCorrection,
): PerceptionResult {
  if (!correction.result_field) {
    return { ...result, interpretation: correction.now, confidence: "high" };
  }
  const fields = (result.fields ?? []).map((f) =>
    f.key === correction.result_field
      ? { ...f, value: correction.now, confidence: "high" as Confidence, unclear: false }
      : f,
  );
  const rolled = summarizeExtraction(fields);
  return { ...result, fields, confidence: rolled.confidence, unresolved: rolled.unresolved };
}
