// Ask capabilities — pure helpers behind the one multimodal composer.
//
// Input method is not a surface. The user attaches a photo, a document or
// speaks; Ask decides what that means. This module holds only the decisions
// that must be identical in the room, the desktop drawer and the mobile sheet:
// what kind of input a file is, whether Echo can actually read it yet, and
// which few things are worth suggesting in the current context.
import type { ThreadContextKind } from "@/lib/askThreads";

/** Input families the composer accepts. */
export type AskInputKind = "text" | "image" | "document" | "audio" | "video" | "other";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?)$/i;
const DOC_EXT = /\.(pdf|docx?|txt|md|rtf|csv|xlsx?|pptx?|odt)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;

/** Classify an attachment. MIME first, filename as the fallback. */
export function inputKindForFile(file: { name?: string | null; type?: string | null }): AskInputKind {
  const mime = (file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || mime.includes("word") || mime.includes("spreadsheet") || mime.includes("presentation") || mime.startsWith("text/")) {
    return "document";
  }
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  if (AUDIO_EXT.test(name)) return "audio";
  if (DOC_EXT.test(name)) return "document";
  return "other";
}

/** What accept="" the attach menu offers per entry point. */
export const ACCEPT = {
  any: "image/*,application/pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,audio/*,video/*",
  image: "image/*",
  document: "application/pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx",
} as const;

export type Readability = {
  /** True when Echo can actually read this input today. */
  readable: boolean;
  /** Honest plain-English state shown on the attachment chip. */
  note: string;
};

/**
 * Honesty rule: an attachment Echo cannot read yet says so on the chip. It is
 * still kept and can still be filed against a project — it just isn't read.
 */
export function readabilityFor(kind: AskInputKind): Readability {
  switch (kind) {
    case "image":
      return { readable: true, note: "I can read this" };
    case "document":
      return { readable: true, note: "I can read this" };
    case "audio":
      return { readable: false, note: "I can keep this, but I can't listen to audio yet" };
    case "video":
      return { readable: false, note: "I can keep this, but I can't watch video yet" };
    default:
      return { readable: false, note: "I can keep this, but I can't read this type yet" };
  }
}

/** Compact size label for an attachment chip. Empty when not worth showing. */
export function sizeLabel(bytes: number | null | undefined): string {
  if (!bytes || bytes < 1024) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type AskSuggestion = {
  id: string;
  label: string;
  /** Prefilled opening question. Never sent for the user. */
  question: string;
};

const BY_KIND: Record<ThreadContextKind, AskSuggestion[]> = {
  project: [
    { id: "resume", label: "Resume", question: "Where did we leave off on this?" },
    { id: "summarize", label: "Summarize", question: "Summarize where this project stands." },
    { id: "next", label: "Next step", question: "What's the next step here?" },
    { id: "sherlock", label: "Sherlock", question: "Look for anything off in this project." },
  ],
  document: [
    { id: "read", label: "Read", question: "Read this and tell me what it says." },
    { id: "compare", label: "Compare", question: "Compare this to the previous version." },
    { id: "verify", label: "Verify", question: "Verify the claims in this document." },
    { id: "sherlock", label: "Sherlock", question: "Look for anything unusual in this document." },
  ],
  receipt: [
    { id: "explain", label: "Explain", question: "Explain what happened here." },
    { id: "trace", label: "Trace", question: "Trace where this change came from." },
    { id: "source", label: "Open source", question: "Show me the source of this change." },
  ],
  action: [
    { id: "explain", label: "Explain", question: "Explain this draft before I approve it." },
    { id: "risk", label: "What's the risk?", question: "What does this touch, and what's the risk?" },
  ],
  commitment: [
    { id: "context", label: "Why this?", question: "Why does this commitment exist?" },
    { id: "next", label: "Next step", question: "What's the next step to close this out?" },
  ],
  sherlock: [
    { id: "deeper", label: "Go deeper", question: "Go deeper on this finding." },
    { id: "verify", label: "Verify", question: "Verify this against outside sources." },
    { id: "save", label: "Save finding", question: "Save this finding to the project." },
  ],
  note: [
    { id: "summarize", label: "Summarize", question: "Summarize this note." },
    { id: "related", label: "Find related", question: "What else relates to this?" },
  ],
  today: [
    { id: "why", label: "Why this?", question: "Why did this surface today?" },
    { id: "changed", label: "What changed?", question: "What changed here?" },
    { id: "prepare", label: "Prepare next step", question: "Prepare the next step for this." },
  ],
  calendar: [
    { id: "prep", label: "Prep me", question: "What should I know before this meeting?" },
    { id: "context", label: "Context", question: "What work does this meeting touch?" },
  ],
  mail: [
    { id: "read", label: "Read", question: "Read this and tell me what matters." },
    { id: "route", label: "Where does it go?", question: "Which project does this belong to?" },
  ],
  nudge: [
    { id: "why", label: "Why this?", question: "Why did you bring this up?" },
    { id: "prepare", label: "Prepare next step", question: "Prepare the next step for this." },
    { id: "watch", label: "Keep an eye on it", question: "Keep an eye on this for me." },
    { id: "quiet", label: "Not important", question: "This isn't important — stay quiet about it." },
  ],
  watch: [
    { id: "catch-up", label: "Catch me up", question: "Catch me up on this — what's the latest?" },
    { id: "moved", label: "What moved?", question: "What changed since Echo started watching this?" },
    { id: "stop", label: "Stop watching", question: "Stop watching this." },
  ],
};

const NO_CONTEXT: AskSuggestion[] = [
  { id: "today", label: "What matters now?", question: "What matters right now?" },
  { id: "waiting", label: "What am I waiting on?", question: "What am I waiting on?" },
  { id: "capture", label: "Capture a note", question: "Save this to memory: " },
];

const WITH_ATTACHMENT: AskSuggestion[] = [
  { id: "read", label: "Read this", question: "Read this and tell me what it says." },
  { id: "identify", label: "What is this?", question: "What is this?" },
  { id: "file", label: "File it", question: "Save this against the right project." },
];

/**
 * The few things worth offering here. Attachments win over context — once
 * something is attached, reading it is almost always the point.
 */
export function suggestionsForContext(
  kind: ThreadContextKind | null | undefined,
  opts: { hasAttachment?: boolean; limit?: number } = {},
): AskSuggestion[] {
  const limit = opts.limit ?? 4;
  if (opts.hasAttachment) return WITH_ATTACHMENT.slice(0, limit);
  const list = kind ? BY_KIND[kind] : NO_CONTEXT;
  return (list ?? NO_CONTEXT).slice(0, limit);
}

const KIND_LABEL: Record<ThreadContextKind, string> = {
  project: "Project",
  document: "Document",
  commitment: "Commitment",
  action: "Draft",
  receipt: "Receipt",
  sherlock: "Finding",
  note: "Note",
  today: "Signal",
  calendar: "Meeting",
  mail: "Mail",
  nudge: "Heads-up",
  watch: "Watch",
};

export function contextKindLabel(kind: ThreadContextKind | null | undefined): string | null {
  return kind ? KIND_LABEL[kind] ?? null : null;
}

/** Where the bound object lives, so its chip travels instead of decorating. */
export function contextHref(kind: ThreadContextKind | null | undefined, id: string | null | undefined): string | null {
  if (!kind) return null;
  switch (kind) {
    case "project":
      return id ? `/projects/${id}` : "/projects";
    case "document":
      return id ? `/documents?document=${id}` : "/documents";
    case "commitment":
      return id ? `/?commitment=${id}` : "/?surface=commitments";
    case "action":
      return "/?surface=actions";
    case "receipt":
      return "/?surface=receipts";
    case "sherlock":
      return "/?surface=sherlock";
    case "note":
      return "/?surface=memory";
    case "today":
      return "/?surface=today";
    case "calendar":
      return "/?surface=schedule";
    case "mail":
      return "/?surface=inbox";
    case "nudge":
      return "/?surface=today";
    case "watch":
      return "/?surface=work";
    default:
      return null;
  }
}

/**
 * The context strip reads as one quiet line: `Workspace · CampStay · Refund workflow`.
 * Scope always leads, because scope is what the answer is bound by.
 */
export function contextStripParts(input: {
  scopeLabel: string;
  kind?: ThreadContextKind | null;
  objectLabel?: string | null;
}): string[] {
  const parts = [input.scopeLabel];
  const kindLabel = contextKindLabel(input.kind);
  if (kindLabel) parts.push(kindLabel);
  if (input.objectLabel) parts.push(input.objectLabel);
  return parts;
}

/**
 * What the composer tells the server about its attachments. Names and kinds
 * only — bytes travel through the file pipeline, not the chat body.
 */
export type AttachmentHint = {
  kind: AskInputKind;
  name: string;
  readable: boolean;
  ingested_file_id?: string | null;
};

export function attachmentHints(
  files: Array<{ name?: string | null; type?: string | null; ingestedFileId?: string | null }>,
): AttachmentHint[] {
  return files.map((f) => {
    const kind = inputKindForFile(f);
    return {
      kind,
      name: f.name ?? "attachment",
      readable: readabilityFor(kind).readable,
      ingested_file_id: f.ingestedFileId ?? null,
    };
  });
}

/**
 * What Echo says while a turn is in flight. Real states only: what it is
 * reading right now, or that it is writing. No invented reasoning stages.
 */
export function processingLabel(
  phase: "reading" | "writing",
  hints: Array<{ kind: AskInputKind }> = [],
): string {
  if (phase === "writing") return "Writing";
  const kinds = new Set(hints.map((h) => h.kind));
  if (kinds.has("document")) return "Reading the document";
  if (kinds.has("image")) return "Looking at the image";
  if (kinds.has("audio")) return "Listening to the recording";
  if (kinds.size > 0) return "Looking at what you sent";
  return "Processing";
}
