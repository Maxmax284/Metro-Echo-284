// documentExport.ts — Phase 1 Document Review packet exports.
// Reuses the existing brief_exports pipeline + BriefPdfDocument renderer.
// No schema change: the document_id is preserved inside brief.grounding.
//
// Two audiences:
//   - operator: full review (risks, obligations, questions, receipts)
//   - client:   sanitized review (no IDs, hides "Risks" → "Considerations",
//               disclaimer footer)
//
// Output: a Brief object shaped for BriefPdfDocument. Persisted via existing
// brief_exports row (format reused: "operator" or "client"). Storage upload
// is performed by the caller using `approveAndExportBrief`.

import { supabase } from "@/integrations/supabase/client";
import {
  approveAndExportBrief, saveBriefDraft,
  type Brief, type BriefSection,
} from "@/lib/briefs";
import {
  DOCUMENT_DISCLAIMER, getDocument, getLatestReview, kindLabel,
  type DocumentObligation, type DocumentReview, type DocumentRisk, type DocumentRow,
} from "@/lib/documents";

export type DocumentExportAudience = "operator" | "client";

const TITLE_PREFIX = "Document review";

function sectionsFor(
  doc: DocumentRow,
  review: DocumentReview,
  risks: DocumentRisk[],
  obligations: DocumentObligation[],
  audience: DocumentExportAudience,
): BriefSection[] {
  const sections: BriefSection[] = [];

  if (review.summary) {
    sections.push({
      id: "overview",
      heading: "Summary",
      kind: "prose",
      body: review.summary,
    });
  }

  if (review.parties?.length) {
    sections.push({
      id: "parties",
      heading: "Parties",
      kind: "list",
      body: review.parties.map((p) => ({
        text: p.role ? `${p.name} — ${p.role}` : p.name,
      })),
    });
  }

  if (review.key_dates?.length) {
    sections.push({
      id: "key_dates",
      heading: "Key dates",
      kind: "list",
      body: review.key_dates.map((d) => ({ text: `${d.label}: ${d.when}` })),
    });
  }

  if (review.money_terms?.length) {
    sections.push({
      id: "money_terms",
      heading: "Money terms",
      kind: "list",
      body: review.money_terms.map((m) => ({ text: `${m.label}: ${m.amount}` })),
    });
  }

  // Obligations always useful for both audiences.
  if (obligations.length) {
    sections.push({
      id: "obligations",
      heading: "Obligations",
      kind: "list",
      body: obligations.map((o) => {
        const tail = [
          o.when_text ? `when: ${o.when_text}` : null,
          o.conditions ? `if: ${o.conditions}` : null,
        ].filter(Boolean).join(" · ");
        return {
          text: `${o.party ?? "Party"} — ${o.what ?? ""}${tail ? ` (${tail})` : ""}`,
        };
      }),
    });
  }

  // Risks — relabel for client audience.
  if (risks.length) {
    sections.push({
      id: "risks",
      heading: audience === "client" ? "Considerations" : "Risks",
      kind: "list",
      body: risks.map((r) => {
        const lead = r.title || "Item";
        const sev = audience === "operator" ? ` [${r.severity}]` : "";
        const detail = r.plain_english ? ` — ${r.plain_english}` : "";
        return { text: `${lead}${sev}${detail}` };
      }),
    });
  }

  if (review.missing_or_unclear?.length) {
    sections.push({
      id: "missing",
      heading: "Missing or unclear",
      kind: "list",
      body: review.missing_or_unclear.map((m) => ({ text: m })),
    });
  }

  if (review.questions_to_ask?.length) {
    sections.push({
      id: "questions",
      heading: "Questions to ask",
      kind: "list",
      body: review.questions_to_ask.map((q) => ({ text: q })),
    });
  }

  if (review.verdict) {
    sections.push({
      id: "verdict",
      heading: "Plain-English verdict",
      kind: "prose",
      body: review.verdict,
    });
  }

  sections.push({
    id: "disclaimer",
    heading: "Note",
    kind: "prose",
    body: DOCUMENT_DISCLAIMER,
  });

  return sections;
}

export function buildDocumentBrief(args: {
  doc: DocumentRow;
  review: DocumentReview;
  risks: DocumentRisk[];
  obligations: DocumentObligation[];
  audience: DocumentExportAudience;
}): Brief {
  const { doc, review, risks, obligations, audience } = args;
  const sections = sectionsFor(doc, review, risks, obligations, audience);

  const subtitle = audience === "client"
    ? `Plain-English review · ${kindLabel(doc.kind)}`
    : `Operator review packet · ${kindLabel(doc.kind)}`;

  return {
    title: `${TITLE_PREFIX} — ${doc.title}`,
    subtitle,
    sections,
    appendix_receipts: [],
    grounding: {
      scope: "project",
      document_id: doc.id,
      review_id: review.id,
      project_id: doc.project_id ?? null,
      audience: audience === "client" ? "client" : "internal_operator",
    },
    signals_hash: review.id,
    format: audience, // reuses brief_exports "operator" | "client"
    scope_kind: "project",
    entity_id: null,
    project_id: doc.project_id ?? null,
    audience: audience === "client" ? "client" : "internal_operator",
    generated_at: new Date().toISOString(),
  };
}

/**
 * Build + persist a document review packet. Returns the saved draft row.
 * Caller is responsible for rendering the PDF blob and calling
 * approveAndExportBrief (so we can keep this file UI-free).
 */
export async function saveDocumentExportDraft(args: {
  document_id: string;
  audience: DocumentExportAudience;
}) {
  const doc = await getDocument(args.document_id);
  if (!doc) throw new Error("Document not found");
  const { review, risks, obligations } = await getLatestReview(args.document_id);
  if (!review) throw new Error("Run a review first.");

  const brief = buildDocumentBrief({
    doc, review, risks, obligations, audience: args.audience,
  });

  const row = await saveBriefDraft({ brief, organization_id: doc.organization_id ?? null });

  // Stamp a document-specific draft event so the bulletin can speak to it.
  const { data: u } = await supabase.auth.getUser();
  if (u?.user?.id) {
    await supabase.from("audit_log").insert({
      user_id: u.user.id,
      entity_type: "document",
      entity_id: doc.id,
      event: "document.export_drafted",
      payload: { audience: args.audience, brief_export_id: row.id },
    });
  }

  return { row, brief, doc };
}

/**
 * Finalize a document export after the PDF blob is rendered by the caller.
 * Emits `document.exported` so it lands in the bulletin's "Done" lane.
 */
export async function finalizeDocumentExport(args: {
  row: Parameters<typeof approveAndExportBrief>[0]["row"];
  pdfBlob: Blob | null;
  document_id: string;
  audience: DocumentExportAudience;
}) {
  const updated = await approveAndExportBrief({ row: args.row, pdfBlob: args.pdfBlob });
  const { data: u } = await supabase.auth.getUser();
  if (u?.user?.id) {
    await supabase.from("audit_log").insert({
      user_id: u.user.id,
      entity_type: "document",
      entity_id: args.document_id,
      event: "document.exported",
      payload: {
        audience: args.audience,
        brief_export_id: updated.id,
        storage_path: updated.storage_path,
      },
    });
  }
  return updated;
}
