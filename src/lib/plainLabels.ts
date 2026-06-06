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
    "brief.generated": "Brief generated",
    "brief.exported": "Brief exported",
    "pdf.generated": "PDF created",
    "audio_brief.generated": "Audio briefing created",
    "audit_packet.generated": "Audit packet created",
    "briefing.viewed": "Briefing read",
    "briefing.refreshed": "Briefing refreshed",
    "briefing.dismissed": "Briefing dismissed",
    "entity.linked": "Connected to a project",
    "cross_link.created": "Items connected",
    "capture.toast_shown": "Capture confirmed",
    "capture.toast_opened": "Capture opened",
  };
  if (exact[event]) return exact[event];
  // Generic transforms: action.executed -> "Action ran", note.created -> "Note created"
  const [domain, verb] = event.split(".");
  const domainLabel = kindLabel(domain);
  if (!verb) return domainLabel;
  const verbMap: Record<string, string> = {
    created: "created",
    updated: "updated",
    deleted: "removed",
    executed: "ran",
    approved: "approved",
    rejected: "rejected",
    completed: "completed",
    snoozed: "snoozed",
    failed: "failed",
    routed: "routed",
    linked: "connected",
    generated: "generated",
    exported: "exported",
    viewed: "read",
  };
  return `${domainLabel} ${verbMap[verb] ?? verb.replace(/_/g, " ")}`;
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
