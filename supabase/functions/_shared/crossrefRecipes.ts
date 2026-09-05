// crossrefRecipes — domain templates for the cross-reference capability.
//
// A recipe is not intelligence. It is a named expectation: which fields matter
// for this kind of paper, which numbers are worth comparing, how records pair
// up, and what the finished document should look like. Detection is a keyword
// read on what the user said plus the filenames — never a model guess, and it
// is always shown to the user so they can change it.
//
// Doctrine kept intact:
//   - a recipe never invents a value. Missing stays missing.
//   - a recipe never executes. It only shapes reading and printing.
//   - the user can override the recipe and the shape at review time.

import { normalizeField, type OutputShape } from "./crossref.ts";

export const RECIPE_IDS = [
  "fight_card",
  "contract",
  "invoice_batch",
  "booking_manifest",
  "generic",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Recipe {
  id: RecipeId;
  /** What the user sees on the review sheet. */
  label: string;
  /** One line: what this template is for. */
  blurb: string;
  /** What one row of this job is called in plain English. */
  recordNoun: string;
  /** Words in the request or a filename that pick this recipe. */
  cues: RegExp;
  /** Fields the reader should look for, in print order. */
  fields: string[];
  /** Fields the document is weak without. Reported, never filled in. */
  required: string[];
  /** Numeric fields where a pairwise difference is meaningful. */
  differenceFields: string[];
  /** Numeric fields worth totalling. */
  totalFields: string[];
  /** Records line up two at a time (red corner / blue corner, party A / B). */
  pairs: boolean;
  /** The document shape this recipe produces by default. */
  shape: OutputShape;
  /** Extra reading guidance handed to the extractor. */
  readingHint: string;
}

export const RECIPES: Record<RecipeId, Recipe> = {
  fight_card: {
    id: "fight_card",
    label: "Fight card",
    blurb: "Bout order, corners, weights and the weight gap between the two fighters.",
    recordNoun: "fighter",
    cues: /\b(fight ?card|fightcard|bout|bouts|matchmak|muay ?thai|boxing|mma|weigh[- ]?in|corner|red corner|blue corner|kickboxing|promotion night)\b/i,
    fields: [
      "bout", "name", "corner", "nickname", "gym", "nationality", "age",
      "weight", "weight_difference", "height", "reach", "record", "rounds", "rule_set",
    ],
    required: ["name", "weight", "corner"],
    differenceFields: ["weight", "height", "reach", "age"],
    totalFields: [],
    pairs: true,
    shape: "fight_card",
    readingHint: [
      "This is a fight card or weigh-in sheet.",
      "One record per fighter, not per bout. If the page groups two fighters under a bout number, put that number in a `bout` field on both.",
      "Read `corner` exactly as written (red / blue / A / B) — leave it out if the page does not say.",
      "Keep weights with their unit as written (kg or lb). Never convert. Never work out the difference.",
    ].join(" "),
  },

  contract: {
    id: "contract",
    label: "Contract or agreement",
    blurb: "Parties, dates, money, term and obligations — each clause kept with the page it came from.",
    recordNoun: "clause or term",
    cues: /\b(contract|agreement|terms? (and|&) conditions|mou|nda|lease|tenancy|engagement letter|statement of work|sow|addendum|amendment|clause|counterpart|signature page)\b/i,
    fields: [
      "party", "role", "effective_date", "end_date", "term", "renewal", "notice_period",
      "fee", "payment_terms", "currency", "deliverable", "obligation", "liability",
      "termination", "governing_law", "signature", "signed_date",
    ],
    required: ["party", "effective_date"],
    differenceFields: ["fee", "notice_period"],
    totalFields: ["fee"],
    pairs: false,
    shape: "contract_terms",
    readingHint: [
      "This is a contract, agreement or an amendment to one.",
      "One record per named party where the page lists parties, and one record per numbered clause or term where it lists terms — label it as written, e.g. \"Clause 4.2 Termination\".",
      "Quote money, dates and notice periods exactly as written, including currency and wording like \"thirty (30) days\".",
      "If two versions of the same clause differ, report both readings as written. Do not decide which one is current.",
    ].join(" "),
  },

  invoice_batch: {
    id: "invoice_batch",
    label: "Invoices and ledger",
    blurb: "Line-by-line agreement between what was billed and what was recorded.",
    recordNoun: "line",
    cues: /\b(invoice|invoices|ledger|statement|reconcil|bank feed|payout|receipt batch|accounts?|bookkeep)\b/i,
    fields: ["reference", "date", "description", "amount", "amount_difference", "tax", "total", "status", "paid_date"],
    required: ["reference", "amount"],
    differenceFields: ["amount", "total"],
    totalFields: ["amount", "total"],
    pairs: false,
    shape: "reconciliation",
    readingHint: [
      "These are invoices, statements or ledger lines.",
      "One record per line item or invoice, keyed on its reference number as written.",
      "Keep amounts as written with their currency symbol. Never add anything up.",
    ].join(" "),
  },

  booking_manifest: {
    id: "booking_manifest",
    label: "Bookings and manifest",
    blurb: "Who is arriving, when, and where the paperwork disagrees.",
    recordNoun: "guest or booking",
    cues: /\b(booking|bookings|manifest|arrival|check[- ]?in|check[- ]?out|guest list|reservation|room list|attendee|passenger)\b/i,
    fields: ["name", "reference", "room", "check_in", "check_out", "nights", "guests", "rate", "status", "notes"],
    required: ["name", "check_in"],
    differenceFields: ["rate", "nights"],
    totalFields: ["rate"],
    pairs: false,
    shape: "roster_sheet",
    readingHint: [
      "This is a booking list, room list or arrivals manifest.",
      "One record per guest or booking, keyed on the name as written.",
      "Keep dates exactly as printed. Do not reformat or work out the number of nights.",
    ].join(" "),
  },

  generic: {
    id: "generic",
    label: "General cross-reference",
    blurb: "No template — Echo reads whatever fields are on the page.",
    recordNoun: "record",
    cues: /$a^/,
    fields: [],
    required: [],
    differenceFields: ["weight", "amount", "total"],
    totalFields: ["amount", "total"],
    pairs: false,
    shape: "clean_form",
    readingHint: "",
  },
};

/** Ordered so the most specific template gets first look. */
const DETECTION_ORDER: RecipeId[] = ["fight_card", "contract", "invoice_batch", "booking_manifest"];

export interface RecipeMatch {
  recipe: Recipe;
  /** Plain-English reason, shown on the review sheet. Never hidden. */
  why: string;
  /** True when the words came from the user, not from a filename. */
  fromRequest: boolean;
}

/**
 * Pick a template from what the user said plus the source filenames and, when
 * available, the first lines of the read text. Falls back to the generic
 * recipe rather than forcing a shape onto paper it does not fit.
 */
export function detectRecipe(args: {
  request?: string | null;
  filenames?: string[];
  sampleText?: string | null;
}): RecipeMatch {
  const request = (args.request ?? "").toLowerCase();
  const names = (args.filenames ?? []).join(" ").toLowerCase();
  const sample = (args.sampleText ?? "").slice(0, 4000).toLowerCase();

  for (const id of DETECTION_ORDER) {
    const recipe = RECIPES[id];
    if (recipe.cues.test(request)) {
      return { recipe, why: `You said this was a ${recipe.label.toLowerCase()}.`, fromRequest: true };
    }
  }
  for (const id of DETECTION_ORDER) {
    const recipe = RECIPES[id];
    if (recipe.cues.test(names)) {
      return { recipe, why: `The filenames read like a ${recipe.label.toLowerCase()}.`, fromRequest: false };
    }
  }
  for (const id of DETECTION_ORDER) {
    const recipe = RECIPES[id];
    if (recipe.cues.test(sample)) {
      return { recipe, why: `The pages read like a ${recipe.label.toLowerCase()}.`, fromRequest: false };
    }
  }
  return {
    recipe: RECIPES.generic,
    why: "Echo could not tell what kind of paper this is, so it read every field it found.",
    fromRequest: false,
  };
}

export function recipeById(id: string | null | undefined): Recipe {
  if (!id) return RECIPES.generic;
  return RECIPES[id as RecipeId] ?? RECIPES.generic;
}

/** Guidance appended to the extraction system prompt. Reading only. */
export function recipeExtractionHint(recipe: Recipe): string {
  if (recipe.id === "generic") return "";
  const wanted = recipe.fields.filter((f) => !f.endsWith("_difference"));
  return [
    "",
    `CONTEXT: ${recipe.readingHint}`,
    wanted.length
      ? `Use these field names when the value is on the page: ${wanted.join(", ")}. Leave a field out entirely when the page does not show it — never guess.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Required fields this case never found. Reported to the user as gaps. */
export function missingRequired(recipe: Recipe, availableFields: string[]): string[] {
  const have = new Set(availableFields.map(normalizeField));
  return recipe.required.filter((f) => !have.has(normalizeField(f)));
}

export interface RecordLike {
  record_key: string;
  display_label: string;
}

export interface Pairing {
  /** Bout number / group label as written, when the page had one. */
  label: string;
  members: RecordLike[];
}

/**
 * Group records into pairs for recipes that work in twos. A `bout` (or `fight`
 * / `match`) field on the records wins; otherwise records pair in the order
 * they were read. An odd record is returned on its own, never invented into a
 * pair.
 */
export function pairRecords(
  records: RecordLike[],
  claims: Array<{ record_key: string; field: string; value_text: string | null }> = [],
): Pairing[] {
  const groupKeys = ["bout", "bout_number", "fight", "fight_number", "match", "pair"];
  const groupOf = (key: string): string | null => {
    for (const g of groupKeys) {
      const hit = claims.find((c) => c.record_key === key && normalizeField(c.field) === g && c.value_text);
      if (hit?.value_text) return hit.value_text.trim();
    }
    return null;
  };

  const grouped = new Map<string, RecordLike[]>();
  const loose: RecordLike[] = [];
  for (const rec of records) {
    const g = groupOf(rec.record_key);
    if (g) {
      const list = grouped.get(g) ?? [];
      list.push(rec);
      grouped.set(g, list);
    } else {
      loose.push(rec);
    }
  }

  const out: Pairing[] = [...grouped.entries()].map(([label, members]) => ({
    label: /^\d+$/.test(label) ? `Bout ${label}` : label,
    members,
  }));

  for (let i = 0; i < loose.length; i += 2) {
    const members = loose.slice(i, i + 2);
    out.push({ label: `Bout ${out.length + 1}`, members });
  }
  return out;
}
