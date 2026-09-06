// documentDraftExport.ts — Phase 2 export of a drafted document as a PDF.
// Reuses the existing brief_exports pipeline + BriefPdfDocument renderer.
// Splits the draft Markdown body into sections by ## headings for clean output.
import { supabase } from "@/integrations/supabase/client";
import {
  approveAndExportBrief, saveBriefDraft,
  type Brief, type BriefSection,
} from "@/lib/briefs";
import {
  DOCUMENT_DISCLAIMER, getDocument, getLatestVersion, kindLabel,
  type DocumentRow,
} from "@/lib/documents";
import { bulletText, stripInlineMarkdown } from "@/lib/markdownText";

export type DraftExportAudience = "operator" | "client" | "signature";

const SIGNATORY_KEYS = [
  "party_a", "party_b", "client_name", "contractor_name",
  "sender_name", "recipient_name", "company_name", "counterparty",
  "signer_a", "signer_b",
];

function extractSignatories(inputs: Record<string, string> | null | undefined) {
  if (!inputs) return [];
  const out: Array<{ name: string; role?: string }> = [];
  const seen = new Set<string>();
  for (const k of SIGNATORY_KEYS) {
    const v = inputs[k];
    if (typeof v === "string" && v.trim() && !seen.has(v.trim().toLowerCase())) {
      seen.add(v.trim().toLowerCase());
      out.push({ name: v.trim(), role: k.replace(/_/g, " ") });
    }
  }
  return out;
}


function sectionsFromMarkdown(body: string): BriefSection[] {
  const lines = body.split(/\r?\n/);
  const sections: BriefSection[] = [];
  let currentHeading: string | undefined = "Document";
  let prose: string[] = [];
  let bullets: string[] = [];

  function flush() {
    if (prose.length) {
      const text = prose.join("\n").trim();
      prose = [];
      if (text) {
        sections.push({
          id: `s-${sections.length}`,
          heading: currentHeading,
          kind: "prose",
          body: stripInlineMarkdown(text),
        });
        currentHeading = undefined;
      }
    }
    if (bullets.length) {
      const items = bullets.map((b) => ({ text: stripInlineMarkdown(b) })).filter((i) => i.text);
      bullets = [];
      if (items.length) {
        sections.push({
          id: `s-${sections.length}`,
          heading: currentHeading,
          kind: "list",
          body: items,
        });
        currentHeading = undefined;
      }
    }
  }

  for (const line of lines) {
    const m = /^#{1,3}\s+(.*)$/.exec(line);
    if (m) {
      flush();
      currentHeading = stripInlineMarkdown(m[1].trim());
      continue;
    }
    const bullet = bulletText(line);
    if (bullet !== null) {
      if (prose.length) flush();
      bullets.push(bullet);
      continue;
    }
    if (bullets.length && line.trim()) flush();
    prose.push(line);
  }
  flush();

  // Single fallback section when no headings present.
  if (sections.length === 0 && body.trim()) {
    sections.push({
      id: "body", heading: "Document", kind: "prose", body: stripInlineMarkdown(body.trim()),
    });
  }
  return sections;
}


export function buildDraftBrief(args: {
  doc: DocumentRow;
  bodyMarkdown: string;
  audience: DraftExportAudience;
}): Brief {
  const { doc, bodyMarkdown, audience } = args;
  const sections = sectionsFromMarkdown(bodyMarkdown);

  // Soft disclaimer always present on the export.
  sections.push({
    id: "disclaimer",
    heading: "Note",
    kind: "prose",
    body: DOCUMENT_DISCLAIMER,
  });

  const isSignature = audience === "signature";
  const isClientFacing = audience === "client" || isSignature;

  const subtitle = isSignature
    ? `Signature packet · ${kindLabel(doc.kind)}`
    : audience === "client"
    ? `Client-ready draft · ${kindLabel(doc.kind)}`
    : `Operator working draft · ${kindLabel(doc.kind)}`;

  const signatures = isSignature
    ? extractSignatories((doc.draft_inputs as Record<string, string> | null) ?? null)
    : [];

  return {
    title: doc.title,
    subtitle,
    sections,
    appendix_receipts: [],
    grounding: {
      scope: "project",
      document_id: doc.id,
      project_id: doc.project_id ?? null,
      audience: isClientFacing ? "client" : "internal_operator",
      kind: "document_draft",
      ...(isSignature ? { watermark: "DRAFT — NOT FOR EXECUTION", signatures } : {}),
    },
    signals_hash: doc.id,
    format: isClientFacing ? "client" : "operator",
    scope_kind: "project",
    entity_id: null,
    project_id: doc.project_id ?? null,
    audience: isClientFacing ? "client" : "internal_operator",
    generated_at: new Date().toISOString(),
  };
}


export async function saveDraftExportDraft(args: {
  document_id: string;
  audience: DraftExportAudience;
}) {
  const doc = await getDocument(args.document_id);
  if (!doc) throw new Error("Document not found");
  const version = await getLatestVersion(args.document_id);
  if (!version?.body_text) throw new Error("No draft to export yet.");

  const brief = buildDraftBrief({
    doc, bodyMarkdown: version.body_text, audience: args.audience,
  });
  const row = await saveBriefDraft({ brief, organization_id: doc.organization_id ?? null });

  const { data: u } = await supabase.auth.getUser();
  if (u?.user?.id) {
    await supabase.from("audit_log").insert({
      user_id: u.user.id,
      entity_type: "document",
      entity_id: doc.id,
      event: "document.export_drafted",
      payload: { audience: args.audience, brief_export_id: row.id, kind: "draft" },
    });
  }
  return { row, brief, doc };
}

export async function finalizeDraftExport(args: {
  row: Parameters<typeof approveAndExportBrief>[0]["row"];
  pdfBlob: Blob | null;
  document_id: string;
  audience: DraftExportAudience;
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
        kind: "draft",
      },
    });
  }
  return updated;
}
