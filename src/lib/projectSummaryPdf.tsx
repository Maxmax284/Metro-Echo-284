// Build a Brief object from a structured Living Brief and render it to a PDF blob.
// Reuses the existing BriefPdfDocument so visuals match other operator exports.
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { BriefPdfDocument } from "@/components/briefs/BriefPdfDocument";
import type { Brief, BriefSection } from "@/lib/briefs";

type StructuredBlocks = {
  overall_summary?: { text?: string; citations?: string[] };
  situation?: { text?: string };
  key_topics?: { themes?: Array<{ title: string; summary: string; citations?: string[] }> };
  decisions?: { bullets?: Array<{ text: string; citations?: string[] }> };
  risks?: { bullets?: Array<{ text: string; citations?: string[] }> };
  next_move?: { text?: string; citations?: string[] };
};

export interface StructuredBriefPayload {
  version?: number;
  tone?: "operator" | "narrative";
  generated_at?: string;
  blocks?: StructuredBlocks;
  ref_index?: Record<string, { kind: string; id: string; label: string }>;
}

export function buildProjectSummaryBrief(
  projectId: string,
  projectTitle: string,
  payload: StructuredBriefPayload,
): Brief {
  const b = payload.blocks ?? {};
  const sections: BriefSection[] = [];

  if (b.overall_summary?.text) {
    sections.push({
      id: "overall_summary",
      heading: "Overall summary",
      kind: "prose",
      body: b.overall_summary.text,
    });
  }
  if (b.situation?.text) {
    sections.push({
      id: "situation",
      heading: "Situation",
      kind: "prose",
      body: b.situation.text,
    });
  }
  if (b.key_topics?.themes?.length) {
    sections.push({
      id: "key_topics",
      heading: "Key topics",
      kind: "list",
      body: b.key_topics.themes.map((t) => ({
        text: `${t.title} — ${t.summary}`,
      })),
    });
  }
  if (b.decisions?.bullets?.length) {
    sections.push({
      id: "decisions",
      heading: "Decisions / known requirements",
      kind: "list",
      body: b.decisions.bullets.map((bl) => ({ text: bl.text })),
    });
  }
  if (b.risks?.bullets?.length) {
    sections.push({
      id: "risks",
      heading: "Risks / questions",
      kind: "list",
      body: b.risks.bullets.map((bl) => ({ text: bl.text })),
    });
  }
  if (b.next_move?.text) {
    sections.push({
      id: "next_move",
      heading: "Next move",
      kind: "decision",
      body: { decision: b.next_move.text, why: "" },
    });
  }

  return {
    title: `${projectTitle} — Living Brief`,
    subtitle: null,
    sections,
    appendix_receipts: [],
    grounding: { project_id: projectId, structured: payload },
    signals_hash: "",
    format: "operator",
    scope_kind: "project",
    entity_id: null,
    project_id: projectId,
    audience: "internal_operator",
    generated_at: payload.generated_at ?? new Date().toISOString(),
  };
}

export async function renderProjectSummaryPdf(brief: Brief): Promise<Blob> {
  return await pdf(<BriefPdfDocument brief={brief} />).toBlob();
}
