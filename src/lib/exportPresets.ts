// Document Engine — export preset registry.
// Declarative shape only. User-facing UI calls runExportPreset() which
// orchestrates Activity state around the existing export pipelines.
// No new DB, no new AI. Presets that don't have a real generator yet
// surface as "waiting_for_user" with a clear message — they never fake success.

import type { WorkHandle } from "@/components/workstatus/ActivityStore";
import { supabase } from "@/integrations/supabase/client";
import {
  STEPS_DOCUMENT_EXPORT,
  STEPS_RECEIPT_PACKET,
} from "@/lib/workStatus";
import { approveAndExportBrief, getBriefDownloadUrl } from "@/lib/briefs";
import { buildProjectSummaryBrief, renderProjectSummaryPdf, type StructuredBriefPayload } from "@/lib/projectSummaryPdf";

export type ExportPresetId =
  | "daily-command-brief"
  | "project-summary-report"
  | "receipt-capture-packet";

export interface ExportPreset {
  id: ExportPresetId;
  label: string;
  description: string;
  outputFormat: "pdf";
  dataSources: string[];
  sections: string[];
  defaultDestination: string;
  steps: readonly string[];
  successCopy: (ctx: { projectName?: string }) => string;
  failureCopy: string;
  /** If false, runExportPreset will mark waiting_for_user instead of pretending. */
  available: boolean;
  /** If true, runExportPreset requires a projectId in context. */
  requiresProject?: boolean;
}

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  "daily-command-brief": {
    id: "daily-command-brief",
    label: "Daily Command Brief",
    description: "Today's command brief as a polished PDF.",
    outputFormat: "pdf",
    dataSources: ["bulletin", "commitments", "schedule"],
    sections: ["overview", "whatChanged", "whatNeedsYou", "nextActions"],
    defaultDestination: "Documents",
    steps: STEPS_DOCUMENT_EXPORT,
    successCopy: () => "Daily brief ready. Saved to Documents.",
    failureCopy: "We couldn't create the brief. Your notes are safe.",
    // Brief export pipeline exists (BriefComposerSheet → approveAndExportBrief),
    // but launching it headlessly from a preset isn't wired yet. Mark not-yet-available
    // so we never fake completion.
    available: false,
  },
  "project-summary-report": {
    id: "project-summary-report",
    label: "Project Summary Report",
    description: "A clean summary of a project's notes, progress, and next steps.",
    outputFormat: "pdf",
    dataSources: ["project", "captures", "notes", "receipts"],
    sections: ["overview", "recentProgress", "openItems", "risks", "nextActions", "receipts"],
    defaultDestination: "this project",
    steps: STEPS_DOCUMENT_EXPORT,
    successCopy: (ctx) =>
      ctx.projectName
        ? `Living brief ready for ${ctx.projectName}. Saved with the project.`
        : "Living brief ready. Saved with the project.",
    failureCopy: "We couldn't create the report. Your notes are safe.",
    available: true,
    requiresProject: true,
  },
  "receipt-capture-packet": {
    id: "receipt-capture-packet",
    label: "Receipt / Capture Packet",
    description: "A packet of receipts linked to their original actions.",
    outputFormat: "pdf",
    dataSources: ["receipts", "captures", "actions"],
    sections: ["summary", "receipts", "linkedActions"],
    defaultDestination: "Receipts",
    steps: STEPS_RECEIPT_PACKET,
    successCopy: () => "Receipt packet ready. Saved with the original actions.",
    failureCopy: "We couldn't build the receipt packet. Your records are safe.",
    available: false,
  },
};

export function listExportPresets(): ExportPreset[] {
  return Object.values(EXPORT_PRESETS);
}

export interface RunPresetContext {
  projectId?: string;
  projectName?: string;
  /** Navigation helper so the success card can open the result. */
  onOpenProject?: (projectId: string) => void;
  /** Re-launch helper so the success card can offer "Regenerate". */
  onRegenerate?: (projectId: string, projectName?: string) => void;
  /** "operator" or "narrative" — passed to the summarize edge function. */
  tone?: "operator" | "narrative";
  /** If false, prior PDF-less mirror rows are kept. Default true. */
  replacePrior?: boolean;
}

/**
 * Run an export preset. Drives the Activity state machine; calls the real
 * generator if available, otherwise surfaces a clear "not available yet"
 * waiting_for_user state. Never fakes completion.
 */
export async function runExportPreset(
  presetId: ExportPresetId,
  ctx: RunPresetContext,
  handle: WorkHandle,
): Promise<void> {
  const preset = EXPORT_PRESETS[presetId];
  if (!preset) {
    handle.fail({ message: "That report type isn't ready yet." });
    return;
  }

  if (preset.requiresProject && !ctx.projectId) {
    handle.waitForUser({
      message: "Pick a project first, then run this report.",
    });
    return;
  }

  if (!preset.available) {
    // Park in "needs you" with an honest message — preset is scaffolded but
    // not wired to a generator yet. UI shows this clearly; no fake success.
    handle.waitForUser({
      message:
        "This report type is scaffolded but not generating yet. Use the existing export from Documents or a project for now.",
    });
    return;
  }

  if (presetId === "project-summary-report" && ctx.projectId) {
    await runProjectSummaryReport(ctx as RunPresetContext & { projectId: string }, handle, preset);
    return;
  }

  // Future generators land here.
  handle.fail({ message: preset.failureCopy });
}

/**
 * Real generator for project-summary-report. Calls the project-summarize
 * edge function, which:
 *   - lazy-digests undigested captures/notes
 *   - writes a structured Living Brief to projects.brief_structured
 *   - mirrors it into brief_exports (status: exported) so it shows up
 *     in the project's Past Briefs list
 * No fake PDF — the brief is saved as a Living Brief record on the project.
 */
async function runProjectSummaryReport(
  ctx: RunPresetContext & { projectId: string },
  handle: WorkHandle,
  preset: ExportPreset,
): Promise<void> {
  try {
    handle.advance(1); // Collecting the right notes

    // Small visible pause so the step ticker reads naturally.
    await new Promise((r) => setTimeout(r, 350));
    handle.advance(2); // Applying the template

    const { data, error } = await supabase.functions.invoke("project-summarize", {
      body: {
        project_id: ctx.projectId,
        tone: ctx.tone ?? "narrative",
        replace_prior: ctx.replacePrior !== false,
      },
    });

    if (error) {
      console.error("[exportPresets] project-summarize failed", error);
      handle.fail({ message: preset.failureCopy });
      return;
    }

    const payload = (data ?? {}) as {
      empty?: boolean;
      structured?: StructuredBriefPayload;
      summary?: string;
      error?: string;
      brief_export_id?: string | null;
      project_id?: string;
    };

    if (payload?.error === "credits_exhausted") {
      handle.fail({
        message:
          "AI credits are exhausted. Add credits in workspace settings, then try again. Your notes are safe.",
      });
      return;
    }
    if (payload?.error === "rate_limited") {
      handle.fail({
        message: "Too many requests right now. Wait a minute and try again.",
      });
      return;
    }
    if (payload?.empty) {
      handle.waitForUser({
        message: "Nothing to summarize yet — attach a few items to this project first.",
      });
      return;
    }
    if (!payload?.structured) {
      handle.fail({ message: preset.failureCopy });
      return;
    }

    handle.advance(3); // Creating the PDF (here: building the structured brief)
    await new Promise((r) => setTimeout(r, 200));
    handle.advance(4); // Saving the file

    const briefExportId = payload.brief_export_id ?? null;
    const structured = payload.structured;
    const projectName = ctx.projectName ?? "this project";

    const primaryAction = ctx.onOpenProject
      ? {
          label: "Open project",
          onClick: () => ctx.onOpenProject?.(ctx.projectId),
        }
      : undefined;

    const secondaryAction = briefExportId
      ? {
          label: "Download PDF",
          onClick: async () => {
            try {
              const brief = buildProjectSummaryBrief(ctx.projectId, projectName, structured);
              const blob = await renderProjectSummaryPdf(brief);
              const row = {
                id: briefExportId,
                user_id: "",
                organization_id: null,
                entity_id: null,
                project_id: ctx.projectId,
                format: "operator" as const,
                scope_kind: "project" as const,
                title: brief.title,
                subtitle: null,
                brief,
                signals_hash: null,
                storage_path: null,
                status: "exported" as const,
                approved_at: null,
                exported_at: null,
                created_at: brief.generated_at,
                updated_at: brief.generated_at,
              };
              const updated = await approveAndExportBrief({ row: row as any, pdfBlob: blob });
              if (updated.storage_path) {
                const url = await getBriefDownloadUrl(updated.storage_path);
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }
            } catch (err) {
              console.error("[exportPresets] download PDF failed", err);
            }
          },
        }
      : undefined;

    const tertiaryAction = ctx.onRegenerate
      ? {
          label: "Regenerate",
          onClick: () => ctx.onRegenerate?.(ctx.projectId, ctx.projectName),
        }
      : undefined;

    handle.complete({
      destination: preset.successCopy({ projectName: ctx.projectName }),
      primaryAction,
      secondaryAction,
      tertiaryAction,
    });
  } catch (e) {
    console.error("[exportPresets] runProjectSummaryReport threw", e);
    handle.fail({ message: preset.failureCopy });
  }
}
