// File intake — Phase 2 schema + validation
// Single source of truth for the shape of an ingested_files row's
// operational fields. Anywhere the client writes detected_doc_type,
// extracted_entities, suggested_actions, sensitive, confidence, or
// review_status, run the payload through these schemas first.
//
// Mirror this in supabase/functions/_shared/fileIntake.ts for edge functions.
import { z } from "zod";

// ---------- Enums ----------------------------------------------------------

export const DETECTED_DOC_TYPES = [
  "unknown",
  "receipt",
  "invoice",
  "booking",
  "contract",
  "schedule",
  "waiver",
  "visa",
  "id_doc",
  "medical",
  "screenshot",
  "image",
  "voice_note",
  "payment_proof",
  "platform_export",
  "other",
] as const;
export type DetectedDocType = (typeof DETECTED_DOC_TYPES)[number];

export const FILE_CONFIDENCES = ["low", "medium", "high"] as const;
export type FileConfidence = (typeof FILE_CONFIDENCES)[number];

export const FILE_REVIEW_STATUSES = [
  "new",
  "needs_review",
  "suggested",
  "routed",
  "attached",
  "archived",
  "ignored",
  "waiting",
  "stale",
] as const;
export type FileReviewStatus = (typeof FILE_REVIEW_STATUSES)[number];

// Document types Echo should treat as sensitive by default — never
// auto-route, never preview unprompted, require explicit user approval.
export const SENSITIVE_DOC_TYPES: ReadonlySet<DetectedDocType> = new Set([
  "id_doc",
  "visa",
  "medical",
  "payment_proof",
  "contract",
  "invoice",
]);

// Suggested-action kinds — drafts only, never auto-executed (Phase 2 doctrine).
export const FILE_SUGGESTED_ACTION_KINDS = [
  "summarize",
  "extract_dates",
  "extract_people",
  "extract_payments",
  "create_reminder",
  "create_commitment",
  "create_action",
  "attach_to_item",
  "attach_to_entity",
  "add_to_briefing",
  "send_to_sherlock",
  "send_to_canvas",
  "archive",
  "mark_reviewed",
  "ignore",
] as const;
export type FileSuggestedActionKind = (typeof FILE_SUGGESTED_ACTION_KINDS)[number];

// ---------- Schemas --------------------------------------------------------

const isoDate = z.string().min(1).max(64);

export const fileExtractedEntitiesSchema = z
  .object({
    dates: z.array(isoDate).max(64).optional(),
    people: z.array(z.string().min(1).max(160)).max(64).optional(),
    amounts: z
      .array(
        z.object({
          value: z.number(),
          currency: z.string().min(1).max(8).optional(),
          label: z.string().max(120).optional(),
        }),
      )
      .max(64)
      .optional(),
    locations: z.array(z.string().min(1).max(200)).max(32).optional(),
    payment_refs: z.array(z.string().min(1).max(120)).max(32).optional(),
    emails: z.array(z.string().email().max(255)).max(32).optional(),
    phones: z.array(z.string().min(3).max(40)).max(32).optional(),
    urls: z.array(z.string().url().max(500)).max(32).optional(),
    document_number: z.string().min(1).max(120).optional(),
    issuer: z.string().min(1).max(160).optional(),
  })
  .strict();

export type FileExtractedEntities = z.infer<typeof fileExtractedEntitiesSchema>;

export const fileSuggestedActionSchema = z
  .object({
    kind: z.enum(FILE_SUGGESTED_ACTION_KINDS),
    label: z.string().min(1).max(160),
    confidence: z.enum(FILE_CONFIDENCES).default("medium"),
    payload: z.record(z.string(), z.unknown()).optional(),
    target_entity_id: z.string().uuid().optional(),
    target_kind: z.string().min(1).max(40).optional(),
    rationale: z.string().max(280).optional(),
  })
  .strict();

export type FileSuggestedAction = z.infer<typeof fileSuggestedActionSchema>;

// Approval record — what the user actually accepted from the suggestions.
export const fileApprovedActionSchema = fileSuggestedActionSchema.extend({
  approved_at: z.string().datetime(),
  resulting_id: z.string().uuid().optional(),
  resulting_kind: z.string().min(1).max(40).optional(),
});
export type FileApprovedAction = z.infer<typeof fileApprovedActionSchema>;

// The write-side schema: what the client/edge function may set on an
// ingested_files row outside of the upload step. All fields optional so this
// doubles as a patch validator.
export const fileIntakeUpdateSchema = z
  .object({
    detected_doc_type: z.enum(DETECTED_DOC_TYPES).optional(),
    extracted_text: z.string().max(200_000).nullable().optional(),
    extracted_entities: fileExtractedEntitiesSchema.optional(),
    suggested_summary: z.string().max(2_000).nullable().optional(),
    suggested_actions: z.array(fileSuggestedActionSchema).max(20).optional(),
    approved_actions: z.array(fileApprovedActionSchema).max(50).optional(),
    sensitive: z.boolean().optional(),
    confidence: z.enum(FILE_CONFIDENCES).optional(),
    review_status: z.enum(FILE_REVIEW_STATUSES).optional(),
  })
  .strict();

export type FileIntakeUpdate = z.infer<typeof fileIntakeUpdateSchema>;

// ---------- Helpers --------------------------------------------------------

/** Returns true if the detected type should be treated as sensitive. */
export function isSensitiveByType(t: DetectedDocType | string | null | undefined): boolean {
  return !!t && SENSITIVE_DOC_TYPES.has(t as DetectedDocType);
}

/**
 * Validate a patch before sending it to Supabase. Throws on invalid input
 * with a flat message suitable for vantaToast.fromError().
 */
export function validateFileIntakeUpdate(patch: unknown): FileIntakeUpdate {
  const parsed = fileIntakeUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`File intake validation failed — ${issues}`);
  }
  return parsed.data;
}

/**
 * Allowed review_status transitions. The Capture Inbox should consult this
 * before letting a user advance a file. Audit events are written by callers
 * after a successful transition.
 */
const REVIEW_TRANSITIONS: Record<FileReviewStatus, ReadonlyArray<FileReviewStatus>> = {
  new: ["needs_review", "suggested", "routed", "attached", "archived", "ignored", "waiting"],
  needs_review: ["suggested", "routed", "attached", "archived", "ignored", "waiting"],
  suggested: ["routed", "attached", "archived", "ignored", "needs_review", "waiting"],
  waiting: ["needs_review", "suggested", "routed", "attached", "archived", "ignored", "stale"],
  routed: ["attached", "archived", "needs_review"],
  attached: ["archived", "needs_review"],
  archived: ["needs_review"], // restore path
  ignored: ["needs_review"],  // restore path
  stale: ["needs_review", "archived"],
};

export function canTransitionReview(from: FileReviewStatus, to: FileReviewStatus): boolean {
  if (from === to) return true;
  return REVIEW_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransitionReview(from: FileReviewStatus, to: FileReviewStatus): void {
  if (!canTransitionReview(from, to)) {
    throw new Error(`Can't move file from "${from}" to "${to}".`);
  }
}

// ---------- Per-type default action map ------------------------------------
// Deterministic suggested actions per detected doc type, used by the aftermath
// tray when the classifier returned nothing usable. Order = priority (primary
// row picks the first 2-3, the rest go behind a "More" disclosure).
// Sensitive types deliberately get *fewer* AI-tagged actions — review first.

export const PER_TYPE_DEFAULT_ACTIONS: Record<DetectedDocType, FileSuggestedActionKind[]> = {
  receipt:         ["extract_payments", "attach_to_entity", "create_reminder", "archive"],
  invoice:         ["extract_dates", "create_reminder", "attach_to_entity", "summarize"],
  booking:         ["extract_dates", "create_reminder", "attach_to_entity", "add_to_briefing"],
  contract:        ["summarize", "create_commitment", "attach_to_entity", "send_to_sherlock"],
  schedule:        ["extract_dates", "add_to_briefing", "attach_to_entity"],
  waiver:          ["create_reminder", "attach_to_entity", "send_to_sherlock"],
  visa:            ["extract_dates", "create_reminder", "mark_reviewed", "archive"],
  id_doc:          ["mark_reviewed", "archive"],
  medical:         ["mark_reviewed", "create_reminder", "archive"],
  screenshot:      ["extract_people", "extract_dates", "attach_to_entity", "summarize"],
  image:           ["attach_to_entity", "send_to_canvas", "summarize"],
  voice_note:      ["summarize", "extract_dates", "create_reminder"],
  payment_proof:   ["extract_payments", "attach_to_entity", "mark_reviewed"],
  platform_export: ["summarize", "attach_to_entity", "archive"],
  other:           ["summarize", "attach_to_entity", "create_reminder"],
  unknown:         ["summarize", "attach_to_entity", "mark_reviewed"],
};

/** Return suggested-action kinds for a doc type, sensitivity-aware. */
export function suggestedActionsForType(
  type: DetectedDocType | string | null | undefined,
  opts?: { sensitive?: boolean },
): FileSuggestedActionKind[] {
  const t = (type && (DETECTED_DOC_TYPES as readonly string[]).includes(type) ? type : "unknown") as DetectedDocType;
  const base = PER_TYPE_DEFAULT_ACTIONS[t] ?? PER_TYPE_DEFAULT_ACTIONS.unknown;
  if (!opts?.sensitive) return base;
  // Sensitive: strip AI-heavy actions, keep only review/reminder/archive/link
  const allowOnSensitive = new Set<FileSuggestedActionKind>([
    "mark_reviewed", "create_reminder", "attach_to_entity", "archive", "ignore",
  ]);
  return base.filter((k) => allowOnSensitive.has(k));
}

// ---------- Deterministic first-pass classification -------------------------
// A file that arrives from a chat should introduce itself the same way an
// in-app upload does: a detected type, an honest confidence, and a review
// status that puts it in the Inbox. This is filename/mime shape only — no
// model, no content reading — so confidence never claims more than "low".

export function detectDocTypeFromFile(input: {
  filename?: string | null;
  mime?: string | null;
  isVoice?: boolean;
  caption?: string | null;
}): DetectedDocType {
  const name = (input.filename ?? "").toLowerCase();
  const mime = (input.mime ?? "").toLowerCase();
  const caption = (input.caption ?? "").toLowerCase();
  const hay = `${name} ${caption}`;

  if (input.isVoice || mime.startsWith("audio/")) return "voice_note";
  if (/\b(invoice|bill|statement)\b/.test(hay)) return "invoice";
  if (/\b(receipt|paid|payment)\b/.test(hay)) return "receipt";
  if (/\b(contract|agreement|nda|sow|lease)\b/.test(hay)) return "contract";
  if (/\b(waiver|consent)\b/.test(hay)) return "waiver";
  if (/\b(booking|reservation|itinerary|ticket|boarding)\b/.test(hay)) return "booking";
  if (/\b(schedule|roster|timetable)\b/.test(hay)) return "schedule";
  if (/\b(visa|permit)\b/.test(hay)) return "visa";
  if (/\b(passport|licence|license|\bid\b)\b/.test(hay)) return "id_doc";
  if (/\b(medical|prescription|lab|clinic)\b/.test(hay)) return "medical";
  if (/screenshot|screen_shot|screen shot/.test(hay)) return "screenshot";
  if (/\.(pdf|docx?|rtf|txt|csv|xlsx?)$/.test(name)) return "other";
  if (mime.startsWith("image/")) return "image";
  return "unknown";
}

/** The whole first-pass patch for a freshly arrived file. */
export function firstPassIntake(input: {
  filename?: string | null;
  mime?: string | null;
  isVoice?: boolean;
  caption?: string | null;
}): {
  detected_doc_type: DetectedDocType;
  sensitive: boolean;
  confidence: FileConfidence;
  review_status: FileReviewStatus;
} {
  const detected_doc_type = detectDocTypeFromFile(input);
  const sensitive = isSensitiveByType(detected_doc_type);
  return {
    detected_doc_type,
    sensitive,
    confidence: "low",
    review_status: "needs_review",
  };
}
