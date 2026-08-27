// vantaNouns — one object, one name.
//
// Doctrine: a user should never have to learn that "capture", "intake item" and
// "fresh in" mean the same thing. Every surface reads its noun, its home, and
// its meta line from here. Sections may still have their own names ("Fresh in")
// — the objects inside them do not.
//
// Pure functions only. Nothing here reads state or invents it.

import type { SurfaceId } from "@/lib/navigation";

export type VantaObject =
  | "capture"
  | "commitment"
  | "action"
  | "decision"
  | "waiting"
  | "artifact"
  | "receipt"
  | "project"
  | "responsibility"
  | "thread";

/** The only user-facing noun for each object. Singular, capitalized. */
export const CANONICAL_NOUN: Record<VantaObject, string> = {
  capture: "Capture",
  commitment: "Commitment",
  action: "Action",
  decision: "Decision",
  waiting: "Waiting On",
  artifact: "Artifact",
  receipt: "Receipt",
  project: "Project",
  responsibility: "Responsibility",
  thread: "Thread",
};

/** Where each object actually lives, so a meta line can say where it opens. */
export const OBJECT_HOME: Record<VantaObject, { label: string; surface: SurfaceId }> = {
  capture: { label: "Inbox", surface: "inbox" },
  commitment: { label: "Commitments", surface: "commitments" },
  action: { label: "Actions", surface: "actions" },
  decision: { label: "Projects", surface: "projects" },
  waiting: { label: "Work", surface: "work" },
  artifact: { label: "Documents", surface: "briefs" },
  receipt: { label: "Receipts", surface: "receipts" },
  project: { label: "Projects", surface: "projects" },
  responsibility: { label: "Work", surface: "work" },
  thread: { label: "Ask", surface: "ask" },
};

/**
 * Synonyms that surfaces have historically invented, mapped back to the one
 * canonical object. Used by `canonicalNoun()` and guarded by a test so a new
 * surface cannot quietly reintroduce a second name for the same thing.
 */
export const NOUN_SYNONYMS: Record<string, VantaObject> = {
  capture: "capture",
  captures: "capture",
  note: "capture",
  notes: "capture",
  "intake item": "capture",
  intake: "capture",
  "fresh in": "capture",
  "loose capture": "capture",
  commitment: "commitment",
  commitments: "commitment",
  promise: "commitment",
  promises: "commitment",
  reminder: "commitment",
  action: "action",
  actions: "action",
  proposal: "action",
  "staged action": "action",
  staged: "action",
  proposed: "action",
  decision: "decision",
  decisions: "decision",
  "waiting on": "waiting",
  waiting: "waiting",
  blocked: "waiting",
  artifact: "artifact",
  artifacts: "artifact",
  document: "artifact",
  documents: "artifact",
  brief: "artifact",
  briefs: "artifact",
  file: "artifact",
  export: "artifact",
  receipt: "receipt",
  receipts: "receipt",
  audit: "receipt",
  "audit entry": "receipt",
  event: "receipt",
  project: "project",
  projects: "project",
  entity: "project",
  responsibility: "responsibility",
  thread: "thread",
  threads: "thread",
  conversation: "thread",
};

/** Resolve any historical label or raw type token to its canonical object. */
export function resolveObject(raw: string | null | undefined): VantaObject | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase().replace(/_/g, " ");
  return NOUN_SYNONYMS[k] ?? null;
}

/** The canonical noun for anything a surface hands us. Falls back to "Item". */
export function canonicalNoun(raw: string | null | undefined): string {
  const obj = resolveObject(raw);
  return obj ? CANONICAL_NOUN[obj] : "Item";
}

/** Plural form, for counts. "3 commitments · nearest Friday". */
export function nounPlural(object: VantaObject, count: number): string {
  const one = CANONICAL_NOUN[object].toLowerCase();
  if (count === 1) return one;
  if (object === "waiting") return "waiting on";
  return `${one}s`;
}

/**
 * The card meta line: what it is, what state it is in, where it opens.
 *
 *   commitment + "due Fri"        -> "Commitment · due Fri · opens Commitments"
 *   action + "needs approval"     -> "Action · needs approval · opens Actions"
 *
 * `state` must be plain English and already computed from a real record.
 * Passing `opensIn: false` drops the destination for cards that open in place.
 */
export function cardMetaLine(input: {
  object: VantaObject;
  state?: string | null;
  /** Override the destination label when a card opens somewhere unusual. */
  destination?: string | null;
  opensIn?: boolean;
}): string {
  const parts: string[] = [CANONICAL_NOUN[input.object]];
  if (input.state) parts.push(input.state);
  if (input.opensIn !== false) {
    const where = input.destination ?? OBJECT_HOME[input.object].label;
    if (where) parts.push(`opens ${where}`);
  }
  return parts.join(" · ");
}

/**
 * The aftermath line: what just happened, and where it will be from now on.
 *
 *   { filedTo: "Lamai rollout", appearsIn: "Receipts" }
 *     -> "Filed to Lamai rollout · appears in Receipts"
 */
export function aftermathLine(input: {
  /** Past-tense verb phrase. Defaults to "Filed". */
  verb?: string;
  filedTo?: string | null;
  appearsIn?: string | null;
}): string {
  const verb = input.verb ?? "Filed";
  const head = input.filedTo ? `${verb} to ${input.filedTo}` : verb;
  return input.appearsIn ? `${head} · appears in ${input.appearsIn}` : head;
}

// ---------- Provenance -----------------------------------------------------

export type ProvenanceSource =
  | "telegram"
  | "whatsapp"
  | "email"
  | "calendar"
  | "you"
  | "upload"
  | "website"
  | "sherlock"
  | "vanta";

export const PROVENANCE_LABEL: Record<ProvenanceSource, string> = {
  telegram: "From Telegram",
  whatsapp: "From WhatsApp",
  email: "From Email",
  calendar: "From Calendar",
  you: "Added by you",
  upload: "From an upload",
  website: "From your website",
  sherlock: "Spotted by Sherlock",
  vanta: "Recorded by Vanta",
};

/** Read a stored source token into one of the sources we can name. */
export function resolveProvenance(raw: string | null | undefined): ProvenanceSource | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes("telegram")) return "telegram";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("mail")) return "email";
  if (s.includes("calendar") || s.includes("ics")) return "calendar";
  if (s === "you" || s === "user" || s === "manual" || s === "self") return "you";
  if (s.includes("upload") || s.includes("file")) return "upload";
  if (s.includes("form") || s.includes("website") || s.includes("web")) return "website";
  if (s.includes("sherlock")) return "sherlock";
  if (s.includes("vanta") || s.includes("system") || s.includes("nudge")) return "vanta";
  return null;
}

// ---------- Freshness ------------------------------------------------------

/**
 * Section-level freshness: says when Vanta last looked, so "nothing happening"
 * never reads as "possibly broken". Never per row.
 */
export function freshnessLabel(
  at: number | null | undefined,
  opts?: { verb?: "Checked" | "Updated" | "Synced"; now?: number },
): string | null {
  if (!at) return null;
  const verb = opts?.verb ?? "Checked";
  const ms = Math.max(0, (opts?.now ?? Date.now()) - at);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return `${verb} just now`;
  if (mins === 1) return `${verb} 1 min ago`;
  if (mins < 60) return `${verb} ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${verb} ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? `${verb} yesterday` : `${verb} ${days} days ago`;
}

// ---------- Collapsed summaries -------------------------------------------

/**
 * A collapsed line worth reading: the count plus the one fact that decides
 * whether opening it is worth the tap.
 *
 *   summaryLine("commitment", 3, "nearest Friday")
 *     -> "3 commitments · nearest Friday"
 */
export function summaryLine(
  object: VantaObject,
  count: number,
  detail?: string | null,
  emptyLine?: string,
): string {
  if (count === 0) return emptyLine ?? "Nothing waiting here.";
  const head = `${count} ${nounPlural(object, count)}`;
  return detail ? `${head} · ${detail}` : head;
}
