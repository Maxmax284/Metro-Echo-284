// Work Status core — plain-English status model + step libraries.
// Used by the Activity Tray and any flow that wants visible work state.
// Routes every label through plainLabels.scrubBannedTokens equivalents so
// backend tokens never leak. No DB, no AI.

export type WorkState =
  | "queued"
  | "working"
  | "waiting_for_user"
  | "complete"
  | "failed"
  | "canceled";

export type WorkKind =
  | "document"
  | "export"
  | "upload"
  | "attach"
  | "save"
  | "project"
  | "receipt"
  | "dismiss"
  | "source"
  | "generic";

export interface WorkPrimaryAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface WorkItem {
  id: string;
  kind: WorkKind;
  title: string;
  projectName?: string;
  steps: string[];
  currentStep: number; // index into steps
  state: WorkState;
  destination?: string;
  error?: string;
  primaryAction?: WorkPrimaryAction;
  startedAt: number;
  finishedAt?: number;
}

/** Map a WorkState to a short plain-English label. */
export function humanizeWorkState(state: WorkState): string {
  switch (state) {
    case "queued": return "Waiting";
    case "working": return "Working";
    case "waiting_for_user": return "Needs you";
    case "complete": return "Done";
    case "failed": return "Needs attention";
    case "canceled": return "Canceled";
  }
}

/** Clean up a step string before showing it. */
export function humanizeWorkStep(step: string | undefined | null): string {
  if (!step) return "Working";
  // Soft scrub of common backend-ish words.
  let s = step.trim();
  s = s.replace(/\bprocessing\b/gi, "Working");
  s = s.replace(/\bartifact composed\b/gi, "Packet ready");
  s = s.replace(/\brender initialized\b/gi, "Preparing the file");
  s = s.replace(/\blifecycle state\b/gi, "status");
  s = s.replace(/\bwebhook received\b/gi, "New capture came in");
  return s;
}

/** Short result line shown when a job completes. */
export function humanizeActionResult(item: WorkItem): string {
  if (item.state === "complete") {
    if (item.destination) return `Done. ${item.destination}`;
    return "Done";
  }
  if (item.state === "waiting_for_user") return item.error ?? "Needs you";
  if (item.state === "failed") return item.error ?? "Needs attention";
  if (item.state === "canceled") return "Canceled";
  return humanizeWorkStep(item.steps[item.currentStep]);
}

/** Calm wording for a failure — answer "what / safe / next". */
export function humanizeWorkError(
  kind: WorkKind,
  raw?: string,
): string {
  // Never surface raw stack/text — pick a kind-specific calm message.
  switch (kind) {
    case "document":
    case "export":
      return "We couldn't create the file. Your notes are safe. Try again or open details.";
    case "upload":
      return "The file uploaded, but we couldn't read it yet. Try again in a moment.";
    case "attach":
      return "We couldn't attach this automatically. Pick a project to finish it.";
    case "save":
      return "We couldn't save that. Nothing was lost. Try again.";
    case "project":
      return "We couldn't update the project. Your changes are still here. Try again.";
    case "receipt":
      return "We couldn't build the receipt packet. Your records are safe.";
    case "source":
      return "Connection failed. Nothing was lost.";
    case "dismiss":
      return "We couldn't hide that. Try again.";
    default:
      return raw && raw.length < 120 ? raw : "Something didn't finish. Nothing was lost.";
  }
}

// ---------------------------------------------------------------------------
// Standard step libraries — calm, action-specific. Use these as the source
// of truth so step copy is consistent across the app.
// ---------------------------------------------------------------------------

export const STEPS_DOCUMENT_EXPORT = [
  "Preparing your report",
  "Collecting the right notes",
  "Applying the template",
  "Creating the PDF",
  "Saving the file",
] as const;

export const STEPS_DOCUMENT_UPLOAD = [
  "Uploading your file",
  "Reading the document",
  "Finding key sections",
  "Checking for projects and dates",
  "Building the summary",
] as const;

export const STEPS_TEMPLATE_CREATE = [
  "Setting up the template",
  "Choosing the right sections",
  "Applying your branding",
  "Saving the template",
] as const;

export function stepsInboxAttach(projectName: string) {
  return [
    `Attaching this to ${projectName}`,
    "Saving the connection",
    "Updating the project",
  ];
}

export const STEPS_PROJECT_UPDATE = [
  "Saving your changes",
  "Refreshing the project",
  "Updating related notes",
] as const;

export const STEPS_RECEIPT_PACKET = [
  "Collecting receipts",
  "Checking linked actions",
  "Building the packet",
  "Saving the file",
] as const;

export const STEPS_DISMISS = [
  "Hiding this from Command Center",
  "Saved in case you need it later",
] as const;

/** Generate a short stable id for a work item. */
export function newWorkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
