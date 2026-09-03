// crossrefArtifact.ts — turns a reviewed case into a Brief, then into a PDF.
// Reuses the existing brief_exports pipeline and BriefPdfDocument. No second
// renderer, no second storage layout.
//
// Honesty rules baked in here:
//   - a value the user corrected is printed and labelled "you set this"
//   - a reading Vanta could not make out prints as "unreadable", never a guess
//   - calculated values are labelled, and were computed in code
//   - held-back sensitive fields are named as held back, not silently dropped
import {
  approveAndExportBrief, saveBriefDraft,
  type Brief, type BriefExportRow, type BriefSection,
} from "@/lib/briefs";
import {
  planArtifact, verifiedValue, SHAPE_SPEC, STATE_LABEL,
  type CaseBundle, type OutputShape,
} from "@/lib/crossref";
import { supabase } from "@/integrations/supabase/client";

const UNREADABLE = "unreadable";

function fieldLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function printable(bundle: CaseBundle, record_key: string, field: string): { text: string; note?: string } {
  const v = verifiedValue(bundle, record_key, field);
  if (v.state === "unreadable") return { text: UNREADABLE, note: "not legible on any source" };
  if (v.state === "missing") return { text: "—", note: "not on any source" };
  if (v.state === "corrected") return { text: v.value ?? "—", note: "you set this" };
  if (v.state === "calculated") return { text: v.value ?? "—", note: "calculated" };
  if (v.state === "conflicts") return { text: v.value ?? "—", note: "sources disagree" };
  return { text: v.value ?? "—" };
}

/** Build the Brief for a case in the chosen shape. Deterministic. */
export function briefForCase(
  bundle: CaseBundle,
  shape: OutputShape,
  opts: { includeSensitive?: string[]; title?: string } = {},
): Brief {
  const plan = planArtifact(bundle, shape, opts.includeSensitive ?? []);
  const fields = plan.printed;
  const sections: BriefSection[] = [];

  const sourceName = (id: string | null) => bundle.sources.find((s) => s.id === id)?.filename ?? "unknown source";

  sections.push({
    id: "what",
    heading: "What was checked",
    kind: "prose",
    body:
      `${bundle.records.length} record${bundle.records.length === 1 ? "" : "s"} read across ${bundle.sources.length} sources: ` +
      `${bundle.sources.map((s) => s.filename).join(", ")}. ` +
      `${bundle.matrix.counts.agrees} fields agree, ${bundle.matrix.counts.conflicts} disagree, ` +
      `${bundle.matrix.counts.missing} were missing and ${bundle.matrix.counts.unreadable} could not be read.`,
  });

  if (shape === "roster_sheet" || shape === "clean_form") {
    sections.push({
      id: "records",
      heading: shape === "roster_sheet" ? "Running order" : "Verified record",
      kind: "roster_card",
      body: bundle.records.map((rec) => ({
        title: rec.display_label,
        subtitle: rec.match_confidence === "uncertain" ? "Same record across sources — not confirmed" : undefined,
        lines: fields.map((f) => {
          const p = printable(bundle, rec.record_key, f);
          return { label: fieldLabel(f), value: p.text, note: p.note };
        }),
      })),
    });
  } else if (shape === "comparison_dossier") {
    sections.push({
      id: "matrix",
      heading: "Side by side",
      kind: "field_table",
      body: {
        columns: ["Record", "Field", ...bundle.sources.map((s) => s.filename)],
        rows: bundle.records.flatMap((rec) =>
          fields.map((f) => [
            rec.display_label,
            fieldLabel(f),
            ...bundle.sources.map((s) => {
              const claim = bundle.claims.find(
                (c) => c.record_key === rec.record_key && c.field === f && c.source_id === s.id,
              );
              if (!claim) return "—";
              return claim.certainty === "uncertain" ? UNREADABLE : (claim.value_text ?? "—");
            }),
          ]),
        ),
      },
    });
  } else {
    sections.push({
      id: "matrix",
      heading: shape === "reconciliation" ? "Line by line" : "Verified fields",
      kind: "field_table",
      body: {
        columns: ["Record", ...fields.map(fieldLabel)],
        rows: bundle.records.map((rec) => [
          rec.display_label,
          ...fields.map((f) => {
            const p = printable(bundle, rec.record_key, f);
            return p.note && p.note !== "you set this" ? `${p.text} (${p.note})` : p.text;
          }),
        ]),
      },
    });
  }

  const openConflicts = bundle.conflicts.filter(
    (c) => c.kind === "contradiction" || c.kind === "unreadable",
  );
  if (openConflicts.length && shape !== "clean_form") {
    sections.push({
      id: "conflicts",
      heading: "What did not line up",
      kind: "conflict_log",
      body: openConflicts.slice(0, 60).map((c) => {
        const rec = bundle.records.find((r) => r.record_key === c.record_key);
        const readings = bundle.claims
          .filter((cl) => cl.record_key === c.record_key && cl.field === c.field)
          .map((cl) =>
            `${sourceName(cl.source_id)}: ${cl.certainty === "uncertain" ? UNREADABLE : (cl.value_text ?? "—")}`,
          );
        const resolution =
          c.resolution === "chose_claim" || c.resolution === "manual_value"
            ? `You settled it: ${c.resolved_value ?? "—"}`
            : c.resolution === "left_open"
              ? "Left open on purpose."
              : "Still open.";
        return {
          what: `${rec?.display_label ?? c.record_key} — ${fieldLabel(c.field)} (${STATE_LABEL[c.kind === "unreadable" ? "unreadable" : "conflicts"]})`,
          readings,
          resolution,
        };
      }),
    });
  }

  if (shape === "audit_report") {
    sections.push({
      id: "provenance",
      heading: "Where each reading came from",
      kind: "field_table",
      body: {
        columns: ["Record", "Field", "Value", "Source", "How sure"],
        rows: bundle.claims
          .filter((c) => fields.includes(c.field))
          .slice(0, 400)
          .map((c) => [
            bundle.records.find((r) => r.record_key === c.record_key)?.display_label ?? c.record_key,
            fieldLabel(c.field),
            c.certainty === "uncertain" ? UNREADABLE : (c.value_text ?? "—"),
            c.derived ? "calculated by Vanta" : sourceName(c.source_id),
            c.certainty,
          ]),
      },
    });
  }

  if (plan.held_back.length) {
    sections.push({
      id: "held_back",
      heading: "Held back on purpose",
      kind: "prose",
      body:
        `These were on the sources but are not printed here: ${plan.held_back.map(fieldLabel).join(", ")}. ` +
        `They stay in the case if you need them.`,
    });
  }

  const shapeLabel = SHAPE_SPEC[shape].label;
  return {
    title: opts.title ?? bundle.case.title ?? "Cross-reference",
    subtitle: shapeLabel,
    sections,
    appendix_receipts: [],
    grounding: {
      kind: "cross_ref_case",
      case_id: bundle.case.id,
      shape,
      sources: bundle.sources.map((s) => ({ id: s.id, filename: s.filename, role: s.role })),
      counts: bundle.matrix.counts,
    },
    signals_hash: `crossref:${bundle.case.id}:${bundle.claims.length}:${bundle.conflicts.filter((c) => c.resolution !== "pending").length}:${shape}`,
    format: shape === "audit_report" ? "audit_packet" : shape === "executive_summary" ? "client" : "operator",
    scope_kind: "system",
    audience: shape === "audit_report" ? "audit" : shape === "roster_sheet" ? "presentation" : "internal_operator",
    generated_at: new Date().toISOString(),
  };
}

/**
 * Compose the artifact: save the draft, render the PDF, export it, and point
 * the case at the receipt. The user taps for this — nothing auto-generates.
 */
export async function composeCaseArtifact(args: {
  bundle: CaseBundle;
  shape: OutputShape;
  includeSensitive?: string[];
  organization_id?: string | null;
}): Promise<BriefExportRow> {
  const brief = briefForCase(args.bundle, args.shape, { includeSensitive: args.includeSensitive });
  const row = await saveBriefDraft({ brief, organization_id: args.organization_id ?? null });

  const [{ pdf }, { BriefPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/briefs/BriefPdfDocument"),
  ]);
  const { createElement } = await import("react");
  const blob = await pdf(createElement(BriefPdfDocument, { brief }) as any).toBlob();
  const exported = await approveAndExportBrief({ row, pdfBlob: blob });

  await supabase
    .from("cross_ref_cases")
    .update({ status: "composed", output_shape: args.shape, brief_export_id: exported.id })
    .eq("id", args.bundle.case.id);

  return exported;
}
