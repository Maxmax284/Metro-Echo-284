// Ask thread model — pure helpers. One thread engine, several presentations.
// A thread is threaded operational memory: what it was about, which scope owned
// it, what it was tied to, and what it produced. No chat-log semantics.

export type ThreadContextKind =
  | "project" | "document" | "commitment" | "action"
  | "receipt" | "sherlock" | "note" | "today" | "calendar" | "mail" | "nudge"
  | "watch";

export type AskThread = {
  id: string;
  title: string | null;
  scope: string;
  organization_id: string | null;
  pinned: boolean;
  archived_at: string | null;
  deleted_at: string | null;
  auto_titled: boolean;
  context_kind: ThreadContextKind | null;
  context_id: string | null;
  context_label: string | null;
  last_message_at: string | null;
  outputs?: ThreadOutputs | null;
  created_at: string;
  updated_at: string;
};

export type ThreadContext = {
  kind: ThreadContextKind;
  id?: string | null;
  label: string;
};

const FILLER = new Set([
  "hey", "hi", "hello", "yo", "sup", "ok", "okay", "thanks", "thank you",
  "yes", "no", "please", "cool", "test", "testing", "hmm", "hm", "?",
]);

/** True when a message carries no intent worth titling a thread after. */
export function isFiller(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!t) return true;
  if (FILLER.has(t)) return true;
  return t.split(/\s+/).length < 2;
}

/**
 * Auto-title from the first substantive intent. Strips lead-ins, trims to a
 * short operational label. Never invents; returns null when there's nothing
 * substantive yet so the caller keeps the placeholder.
 */
export function autoTitle(text: string): string | null {
  if (isFiller(text)) return null;
  let t = text.trim().replace(/\s+/g, " ");
  // Strip stacked lead-ins ("hey so I need you to ...") until intent is left.
  const LEAD_INS = [
    /^(hey|hi|hello|yo|ok|okay|so|umm?|hmm?)[,\s]+/i,
    /^(can you|could you|would you|please|i want you to|i need you to|i need|i want|help me|let'?s)\s+/i,
  ];
  for (let pass = 0; pass < 4; pass++) {
    const before = t;
    for (const re of LEAD_INS) t = t.replace(re, "");
    if (t === before) break;
  }
  t = t.replace(/^(tell me about|explain|look into|check on)\s+/i, "");
  t = t.replace(/[?.!,;:]+$/, "");
  if (!t) return null;
  const words = t.split(" ");
  if (words.length > 8) t = words.slice(0, 8).join(" ") + "…";
  if (t.length > 64) t = t.slice(0, 63).trimEnd() + "…";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Threads a scope may see. Scope is authoritative — no cross-scope bleed. */
export function threadMatchesScope(
  t: Pick<AskThread, "scope" | "organization_id">,
  scope: { type: string; organizationId: string | null },
): boolean {
  if (scope.type === "organization") {
    return t.scope === "organization" && t.organization_id === scope.organizationId;
  }
  return t.scope !== "organization" && !t.organization_id;
}

/** Pinned first (inside scope), then most recent activity. */
export function sortThreads(list: AskThread[]): AskThread[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.last_message_at ?? a.updated_at;
    const bt = b.last_message_at ?? b.updated_at;
    return bt.localeCompare(at);
  });
}

/**
 * Search across what a thread actually carries: its title and the record it is
 * bound to. No message-body search — that would promise a depth the client
 * cannot honestly deliver from the thread list.
 */
export function matchesQuery(t: AskThread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${t.title ?? ""} ${t.context_label ?? ""} ${t.context_kind ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function isLive(t: AskThread): boolean {

  return !t.deleted_at && !t.archived_at;
}

export function threadLabel(t: AskThread): string {
  return t.title?.trim() || "Untitled thread";
}

/** Relative time, plain English, no jargon. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** What a thread produced. Counts only — the records live in their own rooms. */
export type ThreadOutputKind = "draft" | "note" | "commitment" | "document" | "finding";
export type ThreadOutputs = Partial<Record<ThreadOutputKind, number>>;

const OUTPUT_WORDS: Record<ThreadOutputKind, [string, string]> = {
  draft: ["draft", "drafts"],
  note: ["note", "notes"],
  commitment: ["commitment", "commitments"],
  document: ["document", "documents"],
  finding: ["finding", "findings"],
};

const OUTPUT_ORDER: ThreadOutputKind[] = ["draft", "commitment", "note", "document", "finding"];

/** Short chips describing a thread's aftermath: ["2 drafts", "1 note"]. */
export function outputChips(outputs: ThreadOutputs | null | undefined): string[] {
  if (!outputs) return [];
  const chips: string[] = [];
  for (const kind of OUTPUT_ORDER) {
    const n = Number(outputs[kind] ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    const [one, many] = OUTPUT_WORDS[kind];
    chips.push(`${n} ${n === 1 ? one : many}`);
  }
  return chips;
}

/** One-line aftermath summary, or null when the thread produced nothing yet. */
export function outputSummary(outputs: ThreadOutputs | null | undefined): string | null {
  const chips = outputChips(outputs);
  return chips.length ? chips.join(" · ") : null;
}

/** Increment one output counter without losing the others. */
export function bumpOutput(outputs: ThreadOutputs | null | undefined, kind: ThreadOutputKind): ThreadOutputs {
  const base = { ...(outputs ?? {}) };
  base[kind] = Number(base[kind] ?? 0) + 1;
  return base;
}
