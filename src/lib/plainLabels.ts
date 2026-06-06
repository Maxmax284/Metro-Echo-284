// Plain-English labels — single source of truth.
// Use these everywhere instead of raw event/type tokens. Goal: a returning
// user can answer "what changed / what needs me / where did this go" without
// learning Vanta's internal vocabulary.

export const PLACE_LABELS = {
  INBOX: "Inbox",
  MEMORY: "Memory",
  PROJECTS: "Projects",
  COMMAND: "Command Center",
  BRIEFS: "Briefs",
  RECEIPTS: "Receipts",
} as const;

export const PLACE_TAGLINES = {
  INBOX: "Where new captures land.",
  MEMORY: "Where things are stored.",
  PROJECTS: "Where things belong.",
  COMMAND: "Where everything rolls up.",
  BRIEFS: "Where summaries become shareable outputs.",
  RECEIPTS: "Where trust is verified.",
} as const;

/** Friendly noun for a thing kind. */
export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "Item";
  const map: Record<string, string> = {
    note: "Note",
    commitment: "Commitment",
    reminder: "Reminder",
    action: "Action",
    file: "File",
    ingested_file: "File",
    message: "Message",
    capture: "Capture",
    entity: "Project",
    project: "Project",
    person: "Person",
    place: "Place",
    org: "Organization",
    topic: "Topic",
    thing: "Thing",
    event: "Event",
    field_note: "Field note",
    signal: "Signal",
  };
  return map[kind] ?? (kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " "));
}

/** Humanize an audit event key like `brief.generated` -> "Brief generated". */
export function humanizeEvent(event: string): string {
  if (!event) return "Event";
  const exact: Record<string, string> = {
    "brief.generated": "Brief drafted",
    "brief.exported": "Brief exported as PDF",
    "pdf.generated": "PDF created",
    "audio_brief.generated": "Audio briefing created",
    "audit_packet.generated": "Audit packet created",
    "weekly_review.generated": "Weekly review generated",
    "brief.sensitivity_reviewed": "Sensitivity review acknowledged",
    "briefing.viewed": "Briefing read",
    "briefing.refreshed": "Briefing refreshed",
    "briefing.dismissed": "Briefing dismissed",
    "entity.linked": "Connected to a project",
    "cross_link.created": "Items connected",
    "link.created": "Items connected",
    "link.removed": "Connection removed",
    "capture.toast_shown": "Capture confirmed",
    "capture.toast_opened": "Capture opened",
    "file.staged": "File staged",
    "file.uploaded": "File uploaded",
    "file.extracted": "File text extracted",
    "file.linked": "File connected",
    "file.reminder_drafted": "Reminder drafted from file",
    "file.commitment_created": "Commitment drafted from file",
    "file.archived": "File archived",
    "action.executed": "Action ran",
    "action.approved": "Action approved",
    "action.rejected": "Action rejected",
    "commitment.completed": "Commitment completed",
    "commitment.snoozed": "Commitment snoozed",
    "note.created": "Note saved",
    "note.updated": "Note edited",
  };
  if (exact[event]) return exact[event];
  const [domain, verb] = event.split(".");
  const domainLabel = kindLabel(domain);
  if (!verb) return domainLabel;
  const verbMap: Record<string, string> = {
    created: "created", updated: "updated", deleted: "removed",
    executed: "ran", approved: "approved", rejected: "rejected",
    completed: "completed", snoozed: "snoozed", failed: "failed",
    routed: "routed", linked: "connected", generated: "generated",
    exported: "exported", viewed: "read",
  };
  return `${domainLabel} ${verbMap[verb] ?? verb.replace(/_/g, " ")}`;
}

/** Why-trust caption per event family — shown as a soft sub-line. */
export function trustNote(event: string): string {
  const e = (event ?? "").toLowerCase();
  if (e.startsWith("brief.exported") || e.startsWith("pdf.") || e.startsWith("audit_packet") || e.startsWith("weekly_review"))
    return "Logged the moment you approved the export.";
  if (e.startsWith("brief."))
    return "Logged when Vanta drafted or read the brief.";
  if (e.startsWith("audio_brief"))
    return "Logged when the audio briefing was generated.";
  if (e.startsWith("capture."))
    return "Logged the second the capture hit Vanta.";
  if (e.startsWith("link.") || e.startsWith("cross_link.") || e.startsWith("entity.linked"))
    return "Logged when you connected the items.";
  if (e.startsWith("action."))
    return "Logged by the Actions room when the state changed.";
  if (e.startsWith("commitment."))
    return "Logged when the commitment moved.";
  if (e.startsWith("file."))
    return "Logged by the file pipeline at this step.";
  if (e.startsWith("note."))
    return "Logged when the note was saved.";
  return "Logged automatically the moment it happened.";
}

/** Friendly label for a brief format. */
export const BRIEF_FORMAT_LABEL: Record<string, string> = {
  operator: "For me (operator)",
  client: "For a client",
  audit_packet: "Audit packet",
  weekly_review: "Weekly review",
  audio_script: "Audio briefing",
};

/** Briefing section labels — replace internal verdict/what_changed wording. */
export const BRIEFING_SECTION_LABEL = {
  verdict: "What's going on",
  what_changed: "Recent changes",
  what_matters: "What needs you",
  useful_connections: "Connected items",
  source_grounding: "Why this appears here",
} as const;
