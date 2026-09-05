import { stripJargon } from "@/lib/brandVoice";
// Plain-English event renderer — the single library every surface uses to
// turn raw platform/capture rows into a human line:
//   subject → verb → object → when → why it matters
//
// Doctrine (see Vanta_Operational_Briefing_Sherlock_Intelligence_Layer_Prompt):
// no raw database language in user-facing surfaces. Audit keeps the receipts.
// If a row can't be humanized cleanly, fall back to a calm generic.

import { formatDistanceToNow } from "date-fns";

// ── PlainItem — the shared shape every surface can consume ──────────────────
export type PlainItem = {
  title: string;
  description?: string;
  // structural
  subject: string;
  verb: string;
  object?: string;
  when?: string;
  status?: string;
  // meaning
  whyItMatters?: string;
  nextMove?: string;
  tapBehavior?: string;
  // grounding
  sourceLabel?: string;
  sourceTrail?: string[];
  // safety
  sensitivity?: "normal" | "sensitive";
  confidence?: ConfidenceWord;
  scope?: "personal" | "workspace" | "admin";
};

export type PlainEvent = {
  subject: string;
  verb: string;
  object?: string;
  when?: string;
  why?: string;
};

export function renderPlainLine(e: PlainEvent | PlainItem): string {
  const head = stripJargon([e.subject, e.verb, e.object].filter(Boolean).join(" "));
  return e.when ? `${head} · ${e.when}` : head;
}

export function relTime(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return undefined; }
}

// ── Confidence vocabulary (doctrine §confidence) ────────────────────────────
export type ConfidenceWord =
  | "likely match" | "possible match" | "weak match"
  | "needs review" | "repeated pattern" | "no action needed";

export function confidenceWord(raw?: string | null): ConfidenceWord {
  const v = (raw ?? "").toLowerCase();
  if (v === "high" || v === "likely") return "likely match";
  if (v === "medium" || v === "possible") return "possible match";
  if (v === "low" || v === "weak") return "weak match";
  if (v === "pattern") return "repeated pattern";
  if (v === "none") return "no action needed";
  return "needs review";
}

// ── Platform / source display ───────────────────────────────────────────────
const PLATFORM_DISPLAY: Record<string, string> = {
  ground_truth_hub: "LMT Camp State",
  gth: "LMT Camp State",
  campcore: "CampCore",
  fenrir_lock: "Fenrir",
  vineyard_lock: "Fenrir",
  website_forms: "Website",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "Email",
  companion: "Companion",
  file: "File",
  field_note: "Field note",
  calendar: "Calendar",
};
export const displayPlatform = (k?: string | null): string =>
  (k && PLATFORM_DISPLAY[k]) ? PLATFORM_DISPLAY[k] : (k ?? "Capture");

// ── Event-code lookup (doctrine §plain-english renderer) ────────────────────
// Map raw "table.event" codes → { verb, object } sentence fragments.
// New codes can be added without touching consumers.
type EventTemplate = { subject?: string; verb: string; object?: string };
const EVENT_CODE_MAP: Record<string, EventTemplate> = {
  // LMT Camp State
  "gth.booking.created": { verb: "opened", object: "a new booking" },
  "gth.booking.confirmed": { verb: "confirmed", object: "a booking" },
  "gth.booking.state_changed": { verb: "moved", object: "a booking between states" },
  "gth.guest.message": { verb: "sent", object: "a guest message" },
  "gth.maintenance.created": { verb: "opened", object: "a maintenance ticket" },
  "gth.payment.received": { verb: "recorded", object: "a payment" },
  // CampCore
  "campcore.waiver.submitted": { verb: "submitted", object: "a waiver" },
  "campcore.member.request": { verb: "sent", object: "a member request" },
  "campcore.class.changed": { verb: "changed", object: "a class" },
  "campcore.schedule.changed": { verb: "updated", object: "the schedule" },
  // Fenrir / VineyardLock
  "fenrir.security.event": { verb: "logged", object: "a security event" },
  "fenrir.access.event": { verb: "recorded", object: "an access event" },
  // Telegram / messaging
  "telegram.message": { verb: "sent", object: "a message" },
  "telegram.file": { verb: "shared", object: "a file" },
  // Email / website
  "email.attachment": { verb: "attached", object: "a document" },
  "email.thread": { verb: "started", object: "a thread" },
  "forms.submission": { verb: "submitted", object: "a form" },
};

export function lookupEventCode(code?: string | null): EventTemplate | null {
  if (!code) return null;
  return EVENT_CODE_MAP[code.toLowerCase()] ?? null;
}

/** Strip leftover "table.event_name" code fragments from a string. */
export function stripEventCodes(s: string): string {
  return s
    .replace(/\b[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*\b/g, (m) => {
      const tpl = lookupEventCode(m);
      return tpl ? [tpl.verb, tpl.object].filter(Boolean).join(" ") : m.replace(/[._]/g, " ");
    })
    .replace(/\s+/g, " ")
    .trim();
}

// ── Briefing item kinds ─────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  commitment: "Commitment",
  action: "Action",
  capture: "Capture",
  file: "File",
  sherlock_finding: "Sherlock",
  external_signal: "Signal",
  message: "Message",
  reminder: "Reminder",
  overdue: "Overdue",
  due_today: "Due today",
  stale: "Stale",
  untriaged: "Untriaged file",
  briefing_candidate: "Flagged file",
  fresh_capture: "Fresh capture",
  sherlock: "Possible connection",
  note: "Note",
};
export const displayKind = (k: string): string =>
  KIND_LABEL[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ── Briefing source-trail item → plain line ─────────────────────────────────
// Items come from briefing-compose as { kind, id, label, due_at?, source? }
export function humanizeBriefingItem(i: {
  kind: string; label: string; due_at?: string | null; source?: string | null;
}): PlainEvent {
  const cleaned = stripEventCodes(i.label || "");
  const when = relTime(i.due_at ?? null);
  switch (i.kind) {
    case "external_signal": {
      const subject = displayPlatform(i.source ?? undefined);
      return { subject, verb: "sent", object: cleaned || "a signal", when };
    }
    case "overdue":
      return { subject: "Commitment", verb: "is overdue:", object: cleaned, when };
    case "stale":
      return { subject: "Commitment", verb: "has been sitting:", object: cleaned, when };
    case "due_today":
      return { subject: "Commitment", verb: "is due today:", object: cleaned, when };
    case "untriaged":
      return { subject: "File", verb: "is waiting for routing:", object: cleaned, when };
    case "briefing_candidate":
      return { subject: "File", verb: "was flagged for this briefing:", object: cleaned, when };
    case "fresh_capture":
      return { subject: "Note", verb: "landed:", object: cleaned, when };
    case "sherlock":
    case "sherlock_finding":
      return { subject: "Possible connection found —", verb: cleaned, when };
    default: {
      const subject = displayKind(i.kind);
      return { subject, verb: "—", object: cleaned, when };
    }
  }
}

// ── Channel link → plain line ───────────────────────────────────────────────
export function humanizeChannel(link: {
  channel: string; status: string; last_seen_at?: string | null; default_route: string;
}): PlainEvent {
  const subject = displayPlatform(link.channel);
  const verb = link.status === "active" ? "is connected" : `is ${link.status}`;
  const routeName =
    link.default_route === "personal" ? "Personal"
    : link.default_route === "ask_each_time" ? "Ask each time"
    : link.default_route?.startsWith("workspace:") ? "a workspace"
    : link.default_route;
  const object = `routing to ${routeName}`;
  const when = link.last_seen_at ? `last active ${relTime(link.last_seen_at)}` : "not used yet";
  return { subject, verb, object, when };
}

// ── Reminder / commitment → plain line ──────────────────────────────────────
export function humanizeReminder(row: {
  summary: string; due_at?: string | null; status?: string; snooze_count?: number | null;
}): PlainEvent {
  const now = new Date();
  const due = row.due_at ? new Date(row.due_at) : null;
  let verb = "is open:";
  if (due && due < now) verb = "is overdue:";
  else if (due && due.toDateString() === now.toDateString()) verb = "is due today:";
  else if (due) verb = "is upcoming:";
  const snz = (row.snooze_count ?? 0) > 1 ? ` · snoozed ${row.snooze_count}×` : "";
  return {
    subject: "Reminder",
    verb,
    object: row.summary,
    when: (due ? relTime(row.due_at) : undefined) + snz,
  };
}

// ── Ingested file → plain line ──────────────────────────────────────────────
export function humanizeFile(row: {
  filename?: string | null; status?: string | null; mime_type?: string | null;
}): PlainEvent {
  const guess = guessFileKind(row.filename ?? "", row.mime_type ?? "");
  const verb = row.status === "pending" ? "needs routing —" : "is on file —";
  return {
    subject: guess,
    verb,
    object: row.filename ?? "untitled",
  };
}

function guessFileKind(name: string, mime: string): string {
  const n = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp)$/.test(n)) return "Screenshot";
  if (/(receipt|invoice)/.test(n)) return "Receipt";
  if (/(waiver|consent)/.test(n)) return "Waiver-like file";
  if (/(contract|agreement|nda)/.test(n)) return "Contract";
  if (/\.pdf$/.test(n)) return "PDF";
  return "File";
}

// ── Sherlock finding → why-it-matters fallback ──────────────────────────────
export function sherlockWhyFallback(f: {
  mode: string; confidence: string; suggested_action?: string | null;
}): string {
  const c = confidenceWord(f.confidence);
  if (f.suggested_action) {
    return `Suggested: ${f.suggested_action.replace(/_/g, " ")} · ${c}`;
  }
  return `${f.mode.replace(/_/g, " ")} · ${c}`;
}

/**
 * What kind of noticing this is, in words an operator uses. Keyed on the
 * scanner's `finding_type` so a card never leads with a database word.
 * Unknown types fall through to the mode label.
 */
const FINDING_KIND: Record<string, string> = {
  stale_commitment: "Promise past due",
  near_duplicate_note: "Looks like a duplicate",
  recurring_entity: "Keeps coming up",
  obligation_untracked: "Promise with nothing tracking it",
  unapproved_high_risk: "Risk still open",
  meeting_without_context: "Meeting with nothing behind it",
  promise_collides_with_meeting: "Promise clashes with a meeting",
  entity_gone_quiet: "Went quiet",
  notes_disagree: "Two notes disagree",
};

export function sherlockKindLabel(findingType: string | null | undefined): string | null {
  if (!findingType) return null;
  return FINDING_KIND[findingType] ?? null;
}

/** Plain-English title for Sherlock findings — avoids leading with the name. */
export function sherlockTitle(f: { mode: string; summary?: string | null }): string {
  switch (f.mode) {
    case "relate": return "Possible connection found";
    case "extract": return "Detail extracted";
    case "suggest": return "Suggestion";
    case "investigate": return "Worth a look";
    case "observe":
    default: return "Pattern noticed";
  }
}
