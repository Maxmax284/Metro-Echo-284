// Plain-English event renderer — the single library every surface uses to
// turn raw platform/capture rows into a human line:
//   subject → verb → object → when → why it matters
//
// Doctrine: no raw database language in user-facing surfaces. Audit keeps the
// receipts. If a row can't be humanized cleanly, fall back to a calm generic.

import { formatDistanceToNow } from "date-fns";

export type PlainEvent = {
  /** Who/what did the thing. e.g. "Maya R.", "Telegram", "GroundStay" */
  subject: string;
  /** Plain verb phrase. e.g. "sent a message", "moved", "shared a file" */
  verb: string;
  /** Optional object. e.g. "about Villa 2", "from inquiry → confirmed" */
  object?: string;
  /** Optional relative timing. e.g. "2h ago" */
  when?: string;
  /** Optional "so what" line. One short sentence. */
  why?: string;
};

export function renderPlainLine(e: PlainEvent): string {
  const head = [e.subject, e.verb, e.object].filter(Boolean).join(" ");
  return e.when ? `${head} · ${e.when}` : head;
}

export function relTime(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return undefined; }
}

// ── Platform / source display ───────────────────────────────────────────────
const PLATFORM_DISPLAY: Record<string, string> = {
  ground_truth_hub: "GroundStay",
  campcore: "CampCore",
  fenrir_lock: "Fenrir",
  website_forms: "Website",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "Email",
  companion: "Companion",
  file: "File",
  field_note: "Field note",
};
export const displayPlatform = (k?: string | null): string =>
  (k && PLATFORM_DISPLAY[k]) ? PLATFORM_DISPLAY[k] : (k ?? "Capture");

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
};
export const displayKind = (k: string): string =>
  KIND_LABEL[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ── Briefing source-trail item → plain line ─────────────────────────────────
// Items come from briefing-compose as { kind, id, label, due_at?, source? }
export function humanizeBriefingItem(i: {
  kind: string; label: string; due_at?: string | null; source?: string | null;
}): PlainEvent {
  const subject =
    i.kind === "external_signal" ? displayPlatform(i.source ?? undefined)
    : displayKind(i.kind);
  const when = relTime(i.due_at ?? null);
  // Strip raw "table.event_name" patterns if they slipped through.
  const cleaned = i.label
    .replace(/\b[a-z_]+\.[a-z_]+\b/g, (m) => m.replace(/_/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return { subject, verb: "—", object: cleaned, when };
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

// ── Sherlock finding → why-it-matters fallback ──────────────────────────────
export function sherlockWhyFallback(f: {
  mode: string; confidence: string; suggested_action?: string | null;
}): string {
  if (f.suggested_action) {
    return `Suggested: ${f.suggested_action.replace(/_/g, " ")} · ${f.confidence} confidence`;
  }
  return `${f.mode.replace(/_/g, " ")} · ${f.confidence} confidence`;
}
