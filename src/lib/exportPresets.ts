// Document Engine — export preset registry.
// Declarative shape only. User-facing UI calls runExportPreset() which
// orchestrates Activity state around the existing export pipelines.
// No new DB, no new AI. Presets that don't have a real generator yet
// surface as "waiting_for_user" with a clear message — they never fake success.

import type { WorkHandle } from "@/components/workstatus/ActivityStore";
import {
  STEPS_DOCUMENT_EXPORT,
  STEPS_RECEIPT_PACKET,
} from "@/lib/workStatus";

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
        ? `Report ready. Saved to ${ctx.projectName}.`
        : "Report ready. Saved to the project.",
    failureCopy: "We couldn't create the report. Your notes are safe.",
    available: false,
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
  projectName?: string;
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

  if (!preset.available) {
    // Park in "needs you" with an honest message — preset is scaffolded but
    // not wired to a generator yet. UI shows this clearly; no fake success.
    handle.waitForUser({
      message:
        "This report type is scaffolded but not generating yet. Use the existing export from Documents or a project for now.",
    });
    return;
  }

  // When real generators are wired, replace the body below with:
  //   handle.advance(1); await collect(...);
  //   handle.advance(2); await applyTemplate(...);
  //   handle.advance(3); const pdf = await createPdf(...);
  //   handle.advance(4); const dest = await save(pdf);
  //   handle.complete({ destination: preset.successCopy({ ...ctx }) });
  // For now this branch is unreachable while available=false.
  handle.fail({ message: preset.failureCopy });
}
