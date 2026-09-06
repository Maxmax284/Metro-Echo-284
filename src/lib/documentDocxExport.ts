// documentDocxExport.ts — Phase 4 DOCX output for drafted documents.
// Builds a Word (.docx) packet from the markdown draft body. Mirrors the
// PDF export's audience model (operator / client / signature) and adds a
// watermark line + signature page for signature packets.
//
// Plain markdown only (## headings, paragraphs, - bullets). Anything fancy
// degrades to a paragraph.
import {
  AlignmentType, Document, Footer, Header, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, TabStopPosition, TabStopType,
  TextRun,
} from "docx";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_DISCLAIMER, getDocument, getLatestVersion, kindLabel,
  type DocumentRow,
} from "@/lib/documents";
import type { DraftExportAudience } from "@/lib/documentDraftExport";

const SIGNATORY_KEYS = [
  "party_a", "party_b", "client_name", "contractor_name",
  "sender_name", "recipient_name", "company_name", "counterparty",
  "signer_a", "signer_b",
];

function extractSignatories(inputs: Record<string, unknown> | null | undefined) {
  if (!inputs) return [];
  const out: Array<{ name: string; role: string }> = [];
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

function bodyParagraphs(body: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = body.split(/\r?\n/);
  let buffer: string[] = [];

  const flushParagraph = () => {
    const text = buffer.join(" ").trim();
    buffer = [];
    if (!text) return;
    out.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text })],
    }));
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph();
      const level = h[1].length;
      out.push(new Paragraph({
        heading:
          level === 1 ? HeadingLevel.HEADING_1
          : level === 2 ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: h[2].trim(), bold: true })],
      }));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      out.push(new Paragraph({
        numbering: { reference: "doc-bullets", level: 0 },
        children: [new TextRun({ text: bullet[1].trim() })],
      }));
      continue;
    }
    buffer.push(line.trim());
  }
  flushParagraph();
  return out;
}

function signaturePage(signatories: Array<{ name: string; role: string }>): Paragraph[] {
  const heading = new Paragraph({
    pageBreakBefore: true,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
    children: [new TextRun({ text: "Signatures", bold: true })],
  });
  const intro = new Paragraph({
    spacing: { after: 320 },
    children: [new TextRun({
      text: "Each party signs below to acknowledge the terms above.",
      italics: true,
    })],
  });
  const rows: Paragraph[] = [];
  const list = signatories.length > 0
    ? signatories
    : [{ name: "Party A", role: "party a" }, { name: "Party B", role: "party b" }];
  for (const s of list) {
    rows.push(
      new Paragraph({
        spacing: { before: 320, after: 60 },
        children: [new TextRun({ text: s.name, bold: true })],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: `Role: ${s.role}`, size: 18, color: "666666" })],
      }),
      new Paragraph({
        spacing: { before: 240, after: 40 },
        children: [new TextRun({ text: "Signature: ____________________________________" })],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "Print name: ___________________________________" })],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "Date: _________________________________________" })],
      }),
    );
  }
  return [heading, intro, ...rows];
}

export function buildDraftDocx(args: {
  doc: DocumentRow;
  bodyMarkdown: string;
  audience: DraftExportAudience;
}): Document {
  const { doc, bodyMarkdown, audience } = args;
  const isSignature = audience === "signature";
  const isClientFacing = audience === "client" || isSignature;
  const signatories = isSignature
    ? extractSignatories((doc.draft_inputs as Record<string, unknown> | null) ?? null)
    : [];

  const subtitle = isSignature
    ? `Signature packet · ${kindLabel(doc.kind)}`
    : isClientFacing
    ? `Client-ready draft · ${kindLabel(doc.kind)}`
    : `Operator working draft · ${kindLabel(doc.kind)}`;

  const header = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({
        text: isSignature ? "DRAFT — NOT FOR EXECUTION" : subtitle,
        size: 18, color: isSignature ? "B00020" : "666666",
      })],
    })],
  });

  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: doc.title, size: 18, color: "888888" }),
        new TextRun({ text: "\tPage " , size: 18, color: "888888" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888" }),
      ],
    })],
  });

  const title = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 80 },
    children: [new TextRun({ text: doc.title, bold: true, size: 36 })],
  });
  const sub = new Paragraph({
    spacing: { after: 320 },
    children: [new TextRun({ text: subtitle, color: "666666", size: 20 })],
  });

  const body = bodyParagraphs(bodyMarkdown || "—");

  const disclaimer = new Paragraph({
    spacing: { before: 480, after: 120 },
    children: [new TextRun({ text: DOCUMENT_DISCLAIMER, italics: true, size: 18, color: "666666" })],
  });

  const sigPage = isSignature ? signaturePage(signatories) : [];

  return new Document({
    creator: "Echo",
    title: doc.title,
    description: subtitle,
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 30, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [{
        reference: "doc-bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: [title, sub, ...body, disclaimer, ...sigPage],
    }],
  });
}

/**
 * Export the draft as Word. The file is kept the same way the PDF is — stored
 * and recorded as an export row — so it can be reopened later instead of only
 * living in whatever folder the download landed in.
 */
export async function exportDraftDocx(args: {
  document_id: string;
  audience: DraftExportAudience;
}): Promise<{ filename: string; brief_export_id: string | null; storage_path: string | null }> {
  const doc = await getDocument(args.document_id);
  if (!doc) throw new Error("Document not found");
  const version = await getLatestVersion(args.document_id);
  if (!version?.body_text) throw new Error("No draft to export yet.");

  const document = buildDraftDocx({
    doc, bodyMarkdown: version.body_text, audience: args.audience,
  });
  const blob = await Packer.toBlob(document);
  const suffix = args.audience === "signature"
    ? "-signature"
    : args.audience === "client" ? "-client" : "";
  const filename = `${doc.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}${suffix}.docx`;
  saveAs(blob, filename);

  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  if (!uid) return { filename, brief_export_id: null, storage_path: null };

  /* Record it as an export row first, so the stored file has an id to live under. */
  const brief = {
    title: `${doc.title} — Word packet`,
    subtitle: `${kindLabel(doc.kind)} · ${args.audience}`,
    sections: [],
    appendix_receipts: [],
    grounding: {
      scope: "project",
      output: "docx",
      document_id: doc.id,
      version_id: version.id,
      project_id: doc.project_id ?? null,
      audience: args.audience,
    },
    signals_hash: version.id,
    format: "word_packet",
    scope_kind: "project",
    entity_id: null,
    project_id: doc.project_id ?? null,
    generated_at: new Date().toISOString(),
  };

  const { data: row } = await supabase
    .from("brief_exports")
    .insert({
      user_id: uid,
      organization_id: doc.organization_id ?? null,
      project_id: doc.project_id ?? null,
      entity_id: null,
      format: "word_packet",
      scope_kind: "project",
      title: brief.title,
      subtitle: brief.subtitle,
      brief: brief as any,
      signals_hash: version.id,
      status: "draft",
    })
    .select("id")
    .maybeSingle();

  let storage_path: string | null = null;
  if (row?.id) {
    const path = `${uid}/documents/${row.id}.docx`;
    const { error: upErr } = await supabase.storage
      .from("memory-uploads")
      .upload(path, blob, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (!upErr) {
      storage_path = path;
      const now = new Date().toISOString();
      await supabase
        .from("brief_exports")
        .update({ status: "exported", approved_at: now, exported_at: now, storage_path })
        .eq("id", row.id);
    }
  }

  await supabase.from("audit_log").insert({
    user_id: uid,
    entity_type: "document",
    entity_id: doc.id,
    event: "document.exported_docx",
    payload: {
      audience: args.audience,
      filename,
      kind: "draft",
      document_id: doc.id,
      version_id: version.id,
      project_id: doc.project_id ?? null,
      brief_export_id: row?.id ?? null,
      storage_path,
    },
  });

  return { filename, brief_export_id: row?.id ?? null, storage_path };
}

