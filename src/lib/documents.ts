// Documents module (Phase 1 — Review uploaded business documents)
// Plain doctrine: capture never executes. Treat-as-document is a draft
// that the user accepts; extraction and review run only behind explicit taps.
//
// Tables touched: documents, document_versions, document_reviews,
// document_risks, document_obligations. See migration for schema.
import { supabase } from "@/integrations/supabase/client";
import { DOCUMENT_TEMPLATES } from "./documentTemplates";
import { compactCatalog, type IntakeParse } from "../../supabase/functions/_shared/intakeParse";

export const DOCUMENT_KINDS = [
  "nda", "sow", "service", "lease", "partnership",
  "invoice", "policy", "letter", "other", "unknown",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = [
  "uploaded", "extracting", "extracted",
  "reviewing", "reviewed",
  "drafting", "drafted", "approved",
  "failed",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type DocumentRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  source_file_id: string | null;
  kind: DocumentKind;
  title: string;
  parties: unknown;
  status: DocumentStatus;
  latest_review_id: string | null;
  failure_reason: string | null;
  template_key: string | null;
  draft_inputs: Record<string, unknown>;
  tone: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRisk = {
  id: string;
  document_id: string;
  review_id: string;
  severity: "low" | "medium" | "high";
  title: string;
  plain_english: string | null;
  clause_ref: string | null;
  suggested_question: string | null;
  created_at: string;
};

export type DocumentObligation = {
  id: string;
  document_id: string;
  review_id: string;
  party: string | null;
  what: string | null;
  when_text: string | null;
  conditions: string | null;
  source_clause_ref: string | null;
  created_at: string;
};

export type DocumentReview = {
  id: string;
  document_id: string;
  version_id: string;
  summary: string | null;
  parties: Array<{ name: string; role?: string }>;
  key_dates: Array<{ label: string; when: string }>;
  money_terms: Array<{ label: string; amount: string }>;
  obligations: Array<{ party: string; what: string; when?: string }>;
  missing_or_unclear: string[];
  questions_to_ask: string[];
  verdict: string | null;
  model: string | null;
  generated_at: string;
};

export const DOCUMENT_DISCLAIMER =
  "Echo can help you understand and prepare, but this does not replace a licensed attorney.";

// ---------- Status state machine (mirrors intakeLifecycle.ts style) ----------
const TRANSITIONS: Record<DocumentStatus, ReadonlyArray<DocumentStatus>> = {
  uploaded:   ["extracting", "extracted", "drafting", "failed"],
  extracting: ["extracted", "failed"],
  extracted:  ["reviewing", "failed"],
  reviewing:  ["reviewed", "failed"],
  reviewed:   ["reviewing"], // re-review allowed
  drafting:   ["drafted", "failed"],
  drafted:    ["drafting", "approved", "failed"], // can revise (back to drafting) or approve
  approved:   ["drafting"], // revising a locked draft starts a new drafting pass
  failed:     ["extracting", "reviewing", "drafting"],
};
export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- CRUD ------------------------------------------------------------

export async function listProjectDocuments(projectId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

/** All documents the current user can see, scoped to an org when provided.
 *  Used by the global Documents page. RLS does the real gate. */
export async function listAllDocuments(opts: {
  organizationId?: string | null;
} = {}): Promise<DocumentRow[]> {
  let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}


export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as DocumentRow | null;
}

export async function getLatestReview(documentId: string): Promise<{
  review: DocumentReview | null;
  risks: DocumentRisk[];
  obligations: DocumentObligation[];
}> {
  const { data: rev } = await supabase
    .from("document_reviews")
    .select("*")
    .eq("document_id", documentId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rev) return { review: null, risks: [], obligations: [] };
  const [risksRes, oblRes] = await Promise.all([
    supabase.from("document_risks").select("*").eq("review_id", rev.id)
      .order("severity", { ascending: false }),
    supabase.from("document_obligations").select("*").eq("review_id", rev.id),
  ]);
  return {
    review: rev as unknown as DocumentReview,
    risks: (risksRes.data ?? []) as DocumentRisk[],
    obligations: (oblRes.data ?? []) as DocumentObligation[],
  };
}

/** Convert an existing ingested_file into a documents row + audit. */
export async function treatFileAsDocument(opts: {
  userId: string;
  fileId: string;
  filename: string;
  projectId?: string | null;
  organizationId?: string | null;
  kind?: DocumentKind;
  /** The thread this came out of, when it came out of one. */
  conversationId?: string | null;
}): Promise<DocumentRow> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: opts.userId,
      organization_id: opts.organizationId ?? null,
      project_id: opts.projectId ?? null,
      source_file_id: opts.fileId,
      conversation_id: opts.conversationId ?? null,
      kind: opts.kind ?? "unknown",
      title: opts.filename || "Untitled document",
      status: "uploaded",
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("audit_log").insert({
    user_id: opts.userId,
    entity_type: "document",
    entity_id: data.id,
    event: "document.uploaded",
    payload: {
      source_file_id: opts.fileId,
      project_id: opts.projectId ?? null,
      conversation_id: opts.conversationId ?? null,
      document_id: data.id,
    },
  });
  return data as DocumentRow;
}


export async function runExtraction(documentId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("documents-extract", {
    body: { document_id: documentId },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: !!data?.ok, error: data?.error };
}

// ---------- "Analyze document" — one shared path -----------------------------
// The analyze affordance lives wherever files land (memory tray, upload card,
// Documents desk) and must mean the same thing everywhere: file becomes a
// documents row, the read runs, the result is ready for review.

/** Loose sniff: does this file look like a reviewable document? */
export function isDocumentLike(file: { filename: string; detectedDocType?: string | null }): boolean {
  const t = (file.detectedDocType ?? "").toLowerCase();
  if (["contract", "invoice", "waiver", "policy", "other"].includes(t)) return true;
  return /\.(pdf|docx?|rtf|txt)$/i.test(file.filename);
}

/** Map the ingest classifier's type onto a documents kind. */
export function detectedToDocKind(t: string | null): DocumentKind {
  switch ((t ?? "").toLowerCase()) {
    case "contract": return "other";
    case "invoice": return "invoice";
    case "policy": return "policy";
    default: return "unknown";
  }
}

/**
 * Turn saved ingested files into documents and run the read on each.
 * Returns the document ids that made it — one file failing never blocks
 * the rest, and the caller toasts the outcome.
 */
export async function analyzeIngestedFiles(args: {
  userId: string;
  organizationId?: string | null;
  files: { id: string; filename: string; detectedDocType?: string | null }[];
}): Promise<string[]> {
  const docIds: string[] = [];
  for (const f of args.files) {
    if (!isDocumentLike({ filename: f.filename, detectedDocType: f.detectedDocType })) continue;
    try {
      const doc = await treatFileAsDocument({
        userId: args.userId,
        organizationId: args.organizationId ?? null,
        fileId: f.id,
        filename: f.filename,
        kind: detectedToDocKind(f.detectedDocType ?? null),
      });
      /* The words were already pulled when the file arrived — the read is a
         copy, not a fresh AI call. A failed read leaves the doc uploaded and
         the user can tap Read on it. */
      await runExtraction(doc.id).catch(() => ({ ok: false }));
      docIds.push(doc.id);
    } catch {
      /* keep going — the batch reports what it managed */
    }
  }
  return docIds;
}

export async function runReview(documentId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("documents-review", {
    body: { document_id: documentId },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: !!data?.ok, error: data?.error };
}

// ---------- Plain-English helpers ------------------------------------------

export function statusLabel(s: DocumentStatus): string {
  switch (s) {
    case "uploaded":   return "Uploaded";
    case "extracting": return "Reading…";
    case "extracted":  return "Ready to review";
    case "reviewing":  return "Reviewing…";
    case "reviewed":   return "Review ready";
    case "drafting":   return "Drafting…";
    case "drafted":    return "Draft ready";
    case "approved":   return "Approved";
    case "failed":     return "Needs attention";
  }
}

export function kindLabel(k: DocumentKind): string {
  const map: Record<DocumentKind, string> = {
    nda: "NDA", sow: "Statement of work", service: "Service agreement",
    lease: "Lease", partnership: "Partnership agreement", invoice: "Invoice",
    policy: "Policy", letter: "Letter", other: "Other document",
    unknown: "Document",
  };
  return map[k];
}

// ---------- Phase 2: Drafting ---------------------------------------------

export type DocumentVersion = {
  id: string;
  document_id: string;
  user_id: string;
  version_no: number;
  body_text: string | null;
  source: "upload" | "extraction" | "draft" | "revision";
  created_at: string;
};

export type DraftEvidenceRef = {
  kind: "note" | "receipt";
  id: string;
  label: string;
  recordedAt: string;
};

export type EvidenceDraftFormat = "meeting_brief" | "follow_up_memo";

/** Create a new drafted document (no source file). Status starts at 'drafting'. */
export async function createDraftDocument(opts: {
  userId: string;
  title: string;
  kind: DocumentKind;
  templateKey: string;
  inputs: Record<string, unknown>;
  tone: string;
  projectId?: string | null;
  organizationId?: string | null;
}): Promise<DocumentRow> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: opts.userId,
      organization_id: opts.organizationId ?? null,
      project_id: opts.projectId ?? null,
      source_file_id: null,
      kind: opts.kind,
      title: opts.title || "Untitled draft",
      status: "drafting",
      template_key: opts.templateKey,
      draft_inputs: (opts.inputs ?? {}) as never,
      tone: opts.tone,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("audit_log").insert({
    user_id: opts.userId,
    entity_type: "document",
    entity_id: data.id,
    event: "document.draft_started",
    payload: { template_key: opts.templateKey, project_id: opts.projectId ?? null },
  });
  return data as DocumentRow;
}

/**
 * One-breath intake: sort a spoken or typed brief into a template's fields.
 * The model only proposes the sort; the person reads it back in the dialog
 * and taps Draft — nothing in this path creates or drafts a document.
 */
export async function parseIntakeBrief(
  brief: string,
): Promise<{ ok: boolean; parsed?: IntakeParse; error?: string }> {
  const { data, error } = await supabase.functions.invoke("documents-intake", {
    body: { brief, catalog: compactCatalog(DOCUMENT_TEMPLATES) },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: !!data?.ok, parsed: data?.parsed as IntakeParse | undefined, error: data?.error };
}

export async function runDraft(opts: {
  documentId: string;
  templateTitle: string;
  userMessage: string;
  revisionPrompt?: string;
  evidence?: DraftEvidenceRef[];
  draftFormat?: EvidenceDraftFormat;
}): Promise<{ ok: boolean; error?: string; version_id?: string }> {
  const { data, error } = await supabase.functions.invoke("documents-draft", {
    body: {
      document_id: opts.documentId,
      template_title: opts.templateTitle,
      user_message: opts.userMessage,
      revision_prompt: opts.revisionPrompt,
      evidence: opts.evidence,
      draft_format: opts.draftFormat,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: !!data?.ok, error: data?.error, version_id: data?.version_id };
}

/** Reading a ready draft is an acknowledgement, never an approval. */
export async function acknowledgeDocumentDraft(documentId: string, source: "today" | "work" | "telegram" | "documents" = "documents"): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  const { data: nudges } = await supabase.from("nudges")
    .select("id,dedupe_key,status")
    .eq("user_id", userId)
    .eq("related_entity_type", "document")
    .eq("related_entity_id", documentId)
    .eq("kind", "document_draft_ready")
    .in("status", ["pending", "seen"]);
  const ids = (nudges ?? []).map((row) => row.id);
  if (ids.length) await supabase.from("nudges").update({ status: "seen" }).in("id", ids).eq("user_id", userId);
  const keys = (nudges ?? []).map((row) => row.dedupe_key).filter((value): value is string => !!value);
  if (keys.length) await supabase.from("deliveries").update({ acted_status: "seen" }).eq("user_id", userId).in("dedupe_key", keys.map((key) => `nudge:${key}`));
  await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "document",
    entity_id: documentId,
    event: "document.draft_opened",
    payload: { source },
  });
  window.dispatchEvent(new Event("metro:attention-changed"));
}

/** Approve the latest draft — locks the document at status 'approved'. */
export async function approveDraft(documentId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("documents")
    .update({ status: "approved" })
    .eq("id", documentId);
  if (error) throw error;
  await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "document",
    entity_id: documentId,
    event: "document.draft_approved",
    payload: {},
  });
}

/** Get the latest (most recent) version row for a document. */
export async function getLatestVersion(documentId: string): Promise<DocumentVersion | null> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DocumentVersion | null;
}

/** True when the document was authored as a draft (no uploaded source file). */
export function isDraftDocument(doc: Pick<DocumentRow, "source_file_id" | "template_key">): boolean {
  return !doc.source_file_id && !!doc.template_key;
}

/** Every version of a document, newest first. Read-only. */
export async function listVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentVersion[];
}
