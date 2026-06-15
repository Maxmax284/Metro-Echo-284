// Documents module (Phase 1 — Review uploaded business documents)
// Plain doctrine: capture never executes. Treat-as-document is a draft
// that the user accepts; extraction and review run only behind explicit taps.
//
// Tables touched: documents, document_versions, document_reviews,
// document_risks, document_obligations. See migration for schema.
import { supabase } from "@/integrations/supabase/client";

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
  draft_inputs: Record<string, string>;
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
  "Vanta can help you understand and prepare, but this does not replace a licensed attorney.";

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
}): Promise<DocumentRow> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: opts.userId,
      organization_id: opts.organizationId ?? null,
      project_id: opts.projectId ?? null,
      source_file_id: opts.fileId,
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
    payload: { source_file_id: opts.fileId, project_id: opts.projectId ?? null },
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
