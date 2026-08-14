// workLabels — grounded status and time wording for the Work room.
//
// Pure functions. Every label here comes from something recorded: a timestamp,
// an open count, a pending approval. No invented state, no raw field names.

export type ProjectStatus = "needs_you" | "waiting" | "active" | "quiet" | "complete";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  needs_you: "Needs you",
  waiting: "Waiting",
  active: "Active",
  quiet: "Quiet",
  complete: "Complete",
};

/** Semantic token class per status. Neutral by default; colour means something. */
export const PROJECT_STATUS_TONE: Record<ProjectStatus, string> = {
  needs_you: "text-danger",
  waiting: "text-warn",
  active: "text-primary",
  quiet: "text-muted-foreground",
  complete: "text-signal",
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * One status word for a project row, from recorded signals only.
 *   openApprovals — actions staged/proposed on this project
 *   openItems     — unresolved commitments on this project
 */
export function projectStatus(input: {
  status?: string | null;
  openApprovals?: number;
  openItems?: number;
  updatedAt?: string | null;
  now?: number;
}): ProjectStatus {
  const now = input.now ?? Date.now();
  if (input.status === "complete" || input.status === "done" || input.status === "archived") {
    return "complete";
  }
  if ((input.openApprovals ?? 0) > 0) return "needs_you";
  if ((input.openItems ?? 0) > 0) {
    const age = input.updatedAt ? now - new Date(input.updatedAt).getTime() : 0;
    return age > 7 * DAY ? "waiting" : "active";
  }
  const age = input.updatedAt ? now - new Date(input.updatedAt).getTime() : Number.POSITIVE_INFINITY;
  return age > 7 * DAY ? "quiet" : "active";
}

/**
 * Temporal context for a project row. Says how long it has been, and whether
 * something is still open — never a raw timestamp.
 */
export function projectTimeLabel(input: {
  updatedAt?: string | null;
  openItems?: number;
  now?: number;
}): string {
  const { updatedAt } = input;
  if (!updatedAt) return "No activity recorded";
  const now = input.now ?? Date.now();
  const ms = Math.max(0, now - new Date(updatedAt).getTime());
  const mins = Math.round(ms / 60000);
  const days = Math.floor(ms / DAY);
  const open = (input.openItems ?? 0) > 0;

  if (days >= 3) {
    return open ? `Quiet for ${days} days · still open` : `Quiet for ${days} days`;
  }
  if (mins < 1) return "Updated moments ago";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return days === 1 ? "Updated yesterday" : `Updated ${days} days ago`;
}
