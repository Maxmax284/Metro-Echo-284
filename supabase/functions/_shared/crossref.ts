// crossref — the deterministic half of the cross-reference capability.
//
// Doctrine:
//   - the model reads paper. It never matches records, never does arithmetic,
//     never decides which source wins. That all happens here, in code.
//   - nothing is softened: a reading Echo could not make out stays
//     `uncertain` and shows up as an unreadable conflict.
//   - a case never executes anything. It produces a matrix and, once the user
//     has reviewed it, an artifact.

/** How sure Echo is about one piece of evidence. */
export type Certainty = "verified" | "inferred" | "uncertain";

export type SourceRole = "master" | "supporting" | "unknown";

export type ConflictKind = "contradiction" | "missing" | "unreadable" | "duplicate" | "stale";

export interface CaseSourceLike {
  id: string;
  filename: string;
  role: SourceRole;
  authority_rank: number;
  authority_fields?: string[];
}

export interface ClaimLike {
  id?: string;
  source_id: string | null;
  record_key: string;
  field: string;
  value_text: string | null;
  value_number?: number | null;
  unit?: string | null;
  certainty: Certainty;
  page?: number | null;
  excerpt?: string | null;
  sensitive?: boolean;
  derived?: boolean;
}

/* ------------------------------------------------------------------ *
 * Field vocabulary
 * ------------------------------------------------------------------ */

/** Fields that never belong in an artifact unless the user ticks them. */
export const SENSITIVE_FIELDS = [
  "phone", "mobile", "email", "address", "street", "postcode", "zip",
  "insurance", "policy_number", "payment", "card", "iban", "account_number",
  "passport", "id_number", "national_id", "ssn", "emergency_contact",
  "next_of_kin", "medical", "guardian_phone",
] as const;

const SENSITIVE_RE = new RegExp(`(${SENSITIVE_FIELDS.join("|")})`, "i");

/** True when a field name looks like something an outsider should not read. */
export function isSensitiveField(field: string): boolean {
  return SENSITIVE_RE.test(field.replace(/\s+/g, "_"));
}

/** Normalise a field label to a stable key. */
export function normalizeField(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ------------------------------------------------------------------ *
 * Source authority
 * ------------------------------------------------------------------ */

const MASTER_HINT = /(master|official|card|fixture|contract|ledger|invoice|schedule|manifest|roster)/i;
const SUPPORTING_HINT = /(registration|reg[-_ ]?sheet|form|intake|receipt|note|handwrit|photo|img|scan|whatsapp)/i;

/**
 * Guess which source is the spine of the job. Inferred, never hidden — the
 * review sheet shows this line and the user can flip it in one tap.
 */
export function inferSourceRole(
  file: { filename: string; mime_type?: string | null },
): { role: SourceRole; rank: number; why: string } {
  const name = file.filename ?? "";
  const isImage = (file.mime_type ?? "").startsWith("image/") || /\.(png|jpe?g|heic|webp)$/i.test(name);
  if (MASTER_HINT.test(name) && !isImage) {
    return { role: "master", rank: 90, why: "Its name reads like the official sheet." };
  }
  if (SUPPORTING_HINT.test(name) || isImage) {
    return { role: "supporting", rank: 40, why: isImage ? "It is a photo of paper." : "Its name reads like a filled-in form." };
  }
  return { role: "unknown", rank: 50, why: "Echo could not tell what this is from the name alone." };
}

/**
 * Which source wins for one field. A master source outranks supporting ones
 * unless a per-field override says otherwise.
 */
export function authorityFor(field: string, sources: CaseSourceLike[]): CaseSourceLike | null {
  const key = normalizeField(field);
  const override = sources.find((s) => (s.authority_fields ?? []).map(normalizeField).includes(key));
  if (override) return override;
  const ranked = [...sources].sort((a, b) => b.authority_rank - a.authority_rank);
  return ranked[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Entity resolution
 * ------------------------------------------------------------------ */

const NOISE = /\b(mr|mrs|ms|dr|jr|sr|ii|iii)\b/gi;

/** Comparable form of a label: lowercase, no punctuation, no titles. */
export function normalizeLabel(raw: string): string {
  return raw.toLowerCase().replace(NOISE, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** 0..1 similarity built from token overlap plus initial-match tolerance. */
export function labelSimilarity(a: string, b: string): number {
  const ta = normalizeLabel(a).split(" ").filter(Boolean);
  const tb = normalizeLabel(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  for (const t of ta) {
    if (tb.includes(t)) { hits += 1; continue; }
    // "J. Rivera" vs "Jose Rivera" — an initial matching a full token counts part way.
    if (t.length === 1 && tb.some((o) => o.startsWith(t))) hits += 0.6;
    else if (tb.some((o) => o.length > 3 && (o.startsWith(t) || t.startsWith(o)))) hits += 0.5;
  }
  return Math.min(1, hits / Math.max(ta.length, tb.length));
}

export interface ResolvedRecord {
  record_key: string;
  display_label: string;
  match_confidence: Certainty;
  labels: string[];
  source_ids: string[];
}

/**
 * Group raw per-source labels into records. A weak match is kept as its own
 * record and reported as uncertain — Echo asks instead of merging quietly.
 */
export function resolveRecords(
  raw: Array<{ label: string; source_id: string | null }>,
  opts: { sure?: number; maybe?: number } = {},
): ResolvedRecord[] {
  const sure = opts.sure ?? 0.85;
  const maybe = opts.maybe ?? 0.55;
  const groups: Array<{ labels: string[]; sources: Set<string>; best: number }> = [];

  for (const item of raw) {
    const label = (item.label ?? "").trim();
    if (!label) continue;
    let target: (typeof groups)[number] | null = null;
    let score = 0;
    for (const g of groups) {
      const s = Math.max(...g.labels.map((l) => labelSimilarity(l, label)));
      if (s > score) { score = s; target = g; }
    }
    if (target && score >= maybe) {
      target.labels.push(label);
      target.best = Math.min(target.best, score);
      if (item.source_id) target.sources.add(item.source_id);
    } else {
      groups.push({ labels: [label], sources: new Set(item.source_id ? [item.source_id] : []), best: 1 });
    }
  }

  return groups.map((g, i) => {
    const multi = g.labels.length > 1;
    const confidence: Certainty = !multi ? "verified" : g.best >= sure ? "verified" : "uncertain";
    return {
      record_key: `r${i + 1}`,
      display_label: g.labels[0],
      match_confidence: confidence,
      labels: g.labels,
      source_ids: [...g.sources],
    };
  });
}

/* ------------------------------------------------------------------ *
 * Cross-reference matrix
 * ------------------------------------------------------------------ */

export interface MatrixCell {
  record_key: string;
  field: string;
  /** Value Echo would print today. */
  value: string | null;
  state: "agrees" | "conflicts" | "missing" | "unreadable" | "calculated";
  certainty: Certainty;
  claim_ids: string[];
  /** Which source the printed value came from. */
  from_source_id: string | null;
  readings: Array<{ source_id: string | null; value: string | null; certainty: Certainty }>;
}

export interface Matrix {
  fields: string[];
  cells: MatrixCell[];
  conflicts: Array<{ record_key: string; field: string; kind: ConflictKind; claim_ids: string[] }>;
  counts: { records: number; agrees: number; conflicts: number; missing: number; unreadable: number; calculated: number };
}

function sameValue(a: string | null, b: string | null): boolean {
  const norm = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return norm(a) === norm(b);
}

/** Build the matrix from claims. Pure: same input, same matrix, every time. */
export function buildMatrix(
  records: ResolvedRecord[],
  claims: ClaimLike[],
  sources: CaseSourceLike[],
): Matrix {
  const fields = [...new Set(claims.map((c) => normalizeField(c.field)))].sort();
  const cells: MatrixCell[] = [];
  const conflicts: Matrix["conflicts"] = [];

  for (const rec of records) {
    for (const field of fields) {
      const mine = claims.filter(
        (c) => c.record_key === rec.record_key && normalizeField(c.field) === field,
      );
      const readings = mine.map((c) => ({ source_id: c.source_id, value: c.value_text, certainty: c.certainty }));
      const claim_ids = mine.map((c) => c.id).filter(Boolean) as string[];

      if (!mine.length) {
        cells.push({ record_key: rec.record_key, field, value: null, state: "missing", certainty: "uncertain", claim_ids, from_source_id: null, readings });
        conflicts.push({ record_key: rec.record_key, field, kind: "missing", claim_ids });
        continue;
      }

      if (mine.every((c) => c.certainty === "uncertain")) {
        cells.push({ record_key: rec.record_key, field, value: null, state: "unreadable", certainty: "uncertain", claim_ids, from_source_id: mine[0].source_id, readings });
        conflicts.push({ record_key: rec.record_key, field, kind: "unreadable", claim_ids });
        continue;
      }

      const derived = mine.find((c) => c.derived);
      if (derived) {
        cells.push({ record_key: rec.record_key, field, value: derived.value_text, state: "calculated", certainty: "inferred", claim_ids, from_source_id: null, readings });
        continue;
      }

      const readable = mine.filter((c) => c.certainty !== "uncertain");
      const distinct = readable.filter((c, i, arr) => arr.findIndex((o) => sameValue(o.value_text, c.value_text)) === i);
      const winnerSource = authorityFor(field, sources);
      const pick =
        readable.find((c) => c.source_id && winnerSource && c.source_id === winnerSource.id) ?? readable[0];

      if (distinct.length > 1) {
        cells.push({ record_key: rec.record_key, field, value: pick.value_text, state: "conflicts", certainty: "inferred", claim_ids, from_source_id: pick.source_id, readings });
        conflicts.push({ record_key: rec.record_key, field, kind: "contradiction", claim_ids });
      } else {
        cells.push({ record_key: rec.record_key, field, value: pick.value_text, state: "agrees", certainty: readable.length > 1 ? "verified" : pick.certainty, claim_ids, from_source_id: pick.source_id, readings });
      }
    }
  }

  const counts = {
    records: records.length,
    agrees: cells.filter((c) => c.state === "agrees").length,
    conflicts: cells.filter((c) => c.state === "conflicts").length,
    missing: cells.filter((c) => c.state === "missing").length,
    unreadable: cells.filter((c) => c.state === "unreadable").length,
    calculated: cells.filter((c) => c.state === "calculated").length,
  };
  return { fields, cells, conflicts, counts };
}

/* ------------------------------------------------------------------ *
 * Deterministic calculations
 * ------------------------------------------------------------------ */

const NUM_RE = /-?\d+(?:[.,]\d+)?/;

/** Pull a number out of a written value. Returns null when there isn't one. */
export function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = NUM_RE.exec(value.replace(/,(\d{3})\b/g, "$1"));
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Unit written next to a number, when it is one Echo recognises. */
export function parseUnit(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /\b(kg|kgs|lb|lbs|cm|m|mm|in|ft|usd|eur|thb|gbp|%)\b/i.exec(value);
  return m ? m[1].toLowerCase() : null;
}

export interface DerivedClaim extends ClaimLike {
  label: string;
}

/**
 * Pairwise differences on a numeric field, in order. Used for weight
 * differences on a fight card, totals variance on a ledger, and anything else
 * shaped the same way. Arithmetic never goes near the model.
 */
export function differencesFor(
  field: string,
  ordered: Array<{ record_key: string; value: string | null }>,
): DerivedClaim[] {
  const out: DerivedClaim[] = [];
  for (let i = 0; i + 1 < ordered.length; i += 2) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const na = parseNumber(a.value);
    const nb = parseNumber(b.value);
    if (na === null || nb === null) continue;
    const unit = parseUnit(a.value) ?? parseUnit(b.value);
    const diff = Math.round(Math.abs(na - nb) * 100) / 100;
    const text = unit ? `${diff} ${unit}` : String(diff);
    for (const rec of [a, b]) {
      out.push({
        source_id: null,
        record_key: rec.record_key,
        field: `${normalizeField(field)}_difference`,
        value_text: text,
        value_number: diff,
        unit,
        certainty: "inferred",
        derived: true,
        label: `${field} difference`,
      });
    }
  }
  return out;
}

/** Sum of a numeric field across records, for reconciliation-style jobs. */
export function totalFor(values: Array<string | null>): { total: number; unit: string | null; counted: number } {
  let total = 0;
  let counted = 0;
  let unit: string | null = null;
  for (const v of values) {
    const n = parseNumber(v);
    if (n === null) continue;
    total += n;
    counted += 1;
    unit = unit ?? parseUnit(v);
  }
  return { total: Math.round(total * 100) / 100, unit, counted };
}

/* ------------------------------------------------------------------ *
 * Output shapes
 * ------------------------------------------------------------------ */

export const OUTPUT_SHAPES = [
  "fight_card",
  "contract_terms",
  "roster_sheet",
  "reconciliation",
  "comparison_dossier",
  "clean_form",
  "audit_report",
  "executive_summary",
  "table_report",
] as const;


export type OutputShape = (typeof OUTPUT_SHAPES)[number];

/** What each shape prints, and what it deliberately leaves out. */
export const SHAPE_SPEC: Record<OutputShape, { label: string; blurb: string; prefer: string[]; drop_sensitive: boolean }> = {
  fight_card: {
    label: "Fight card",
    blurb: "Bout by bout, both corners side by side, with the weight gap printed.",
    prefer: ["bout", "corner", "name", "nickname", "gym", "nationality", "age", "weight", "weight_difference", "height", "reach", "record", "rounds", "rule_set"],
    drop_sensitive: true,
  },
  contract_terms: {
    label: "Contract terms sheet",
    blurb: "Parties, dates, money and obligations, each term kept with its page.",
    prefer: ["party", "role", "effective_date", "end_date", "term", "renewal", "notice_period", "fee", "payment_terms", "currency", "deliverable", "obligation", "liability", "termination", "governing_law", "signature", "signed_date"],
    drop_sensitive: true,
  },

  roster_sheet: {
    label: "Announcer / roster sheet",
    blurb: "One card per person or item, in running order. Read-aloud friendly.",
    prefer: ["name", "corner", "age", "height", "weight", "weight_difference", "gym", "record", "bout"],
    drop_sensitive: true,
  },
  reconciliation: {
    label: "Reconciliation report",
    blurb: "Line-by-line agreement and variance between two sets of numbers.",
    prefer: ["reference", "date", "amount", "amount_difference", "total", "status"],
    drop_sensitive: true,
  },
  comparison_dossier: {
    label: "Comparison dossier",
    blurb: "Side-by-side readings from every source, with each source named.",
    prefer: [],
    drop_sensitive: true,
  },
  clean_form: {
    label: "Clean final form",
    blurb: "The verified version, typed up, nothing else.",
    prefer: [],
    drop_sensitive: true,
  },
  audit_report: {
    label: "Audit report",
    blurb: "Every claim with where it came from and how sure Echo is.",
    prefer: [],
    drop_sensitive: true,
  },
  executive_summary: {
    label: "Executive summary",
    blurb: "One page: what was checked, what matched, what did not.",
    prefer: [],
    drop_sensitive: true,
  },
  table_report: {
    label: "Table report",
    blurb: "The whole matrix as one wide table.",
    prefer: [],
    drop_sensitive: true,
  },
};

/** Guess the shape from what the user actually said. */
export function inferOutputShape(text: string): OutputShape {
  const t = (text ?? "").toLowerCase();
  if (/\b(fight ?card|bout|bouts|weigh[- ]?in|corner)\b/.test(t)) return "fight_card";
  if (/\b(contract|agreement|nda|mou|lease|clause|terms? sheet)\b/.test(t)) return "contract_terms";
  if (/\b(announce|announcer|roster|line ?up|running order|card)\b/.test(t)) return "roster_sheet";

  if (/\b(reconcile|reconciliation|variance|ledger|invoice|balance)\b/.test(t)) return "reconciliation";
  if (/\b(compare|side by side|dossier|versus|vs\.?)\b/.test(t)) return "comparison_dossier";
  if (/\b(audit|provenance|receipts|where.*came from)\b/.test(t)) return "audit_report";
  if (/\b(summary|summarize|brief|one pager|executive)\b/.test(t)) return "executive_summary";
  if (/\b(table|spreadsheet|grid|matrix)\b/.test(t)) return "table_report";
  return "clean_form";
}

/** Which fields this shape prints, sensitive ones held back unless allowed. */
export function fieldsForShape(
  shape: OutputShape,
  available: string[],
  opts: { include_sensitive?: string[] } = {},
): { printed: string[]; held_back: string[] } {
  const allow = new Set((opts.include_sensitive ?? []).map(normalizeField));
  const spec = SHAPE_SPEC[shape];
  const held: string[] = [];
  const keep: string[] = [];
  for (const f of available) {
    if (spec.drop_sensitive && isSensitiveField(f) && !allow.has(normalizeField(f))) held.push(f);
    else keep.push(f);
  }
  if (!spec.prefer.length) return { printed: keep, held_back: held };
  const order = new Map(spec.prefer.map((f, i) => [normalizeField(f), i]));
  keep.sort((a, b) => (order.get(normalizeField(a)) ?? 99) - (order.get(normalizeField(b)) ?? 99));
  return { printed: keep, held_back: held };
}

/* ------------------------------------------------------------------ *
 * Detection — is this a multi-source job?
 * ------------------------------------------------------------------ */

const CROSSREF_PHRASES =
  /\b(cross.?reference|cross.?check|same treatment|what doesn'?t match|what does not match|find the mismatch|discrepanc|reconcile|compare these|check these against|build me the final|final version|verify these|match these up)\b/i;

/**
 * Two or more readable sources plus intent, or two or more sources and an
 * explicit ask. Ordinary "read this" stays ordinary.
 */
export function looksLikeCrossReference(input: {
  text: string;
  readableAttachments: number;
}): { match: boolean; reason: string } {
  const asked = CROSSREF_PHRASES.test(input.text ?? "");
  if (asked && input.readableAttachments >= 2) {
    return { match: true, reason: "You asked to cross-reference, and there are several sources." };
  }
  if (asked && input.readableAttachments === 0) {
    return { match: false, reason: "Nothing is attached to cross-reference yet." };
  }
  if (input.readableAttachments >= 2) {
    return { match: true, reason: "More than one source arrived together." };
  }
  return { match: false, reason: "One source is a read, not an investigation." };
}
