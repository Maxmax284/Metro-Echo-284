// Ask session — the live state of a thread while you are in it.
//
// Threads themselves live in AskThreadProvider (durable, database-backed).
// This is the volatile half: the turns on screen, the half-typed line in the
// composer, and the stream that is still arriving. It lives outside React on
// purpose, keyed by thread id, so moving between Ask surfaces (quick drawer,
// mobile sheet, full Ask room) never interrupts a turn or loses a draft.
//
// Rules:
// - One session per thread. Two mounted surfaces show the same session.
// - A surface unmounting does NOT cancel the stream. Only the user does.
// - Nothing here is persisted; the transcript is written to the database by
//   the surface exactly as before.

export type AskSessionMsg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  receipt?: { kind: string; summary: string; surface: string };
  metadata?: Record<string, unknown> | null;
};

export type AskSession = {
  threadId: string;
  /** Turns on screen. Empty + !hydrated means "not loaded from the db yet". */
  messages: AskSessionMsg[];
  /** True once the transcript has been read from the database. */
  hydrated: boolean;
  /** Unsent composer text. Survives surface switches. */
  draft: string;
  /** A turn is in flight right now. */
  streaming: boolean;
  /** How the user stops that turn, from whichever surface they are on. */
  abort: AbortController | null;
};

type Listener = (s: AskSession) => void;

const sessions = new Map<string, AskSession>();
const listeners = new Map<string, Set<Listener>>();

function blank(threadId: string): AskSession {
  return { threadId, messages: [], hydrated: false, draft: "", streaming: false, abort: null };
}

export function getAskSession(threadId: string): AskSession {
  let s = sessions.get(threadId);
  if (!s) { s = blank(threadId); sessions.set(threadId, s); }
  return s;
}

function emit(threadId: string) {
  const s = getAskSession(threadId);
  listeners.get(threadId)?.forEach((fn) => fn(s));
}

/** Replace the session with a patched copy and notify every mounted surface. */
export function patchAskSession(threadId: string, patch: Partial<AskSession>): AskSession {
  const next = { ...getAskSession(threadId), ...patch, threadId };
  sessions.set(threadId, next);
  emit(threadId);
  return next;
}

export function subscribeAskSession(threadId: string, fn: Listener): () => void {
  let set = listeners.get(threadId);
  if (!set) { set = new Set(); listeners.set(threadId, set); }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) listeners.delete(threadId);
  };
}

/** Transcript writes go through here so both surfaces stay in step. */
export function setAskMessages(
  threadId: string,
  update: AskSessionMsg[] | ((prev: AskSessionMsg[]) => AskSessionMsg[]),
  opts?: { hydrated?: boolean },
): AskSessionMsg[] {
  const prev = getAskSession(threadId).messages;
  const messages = typeof update === "function" ? update(prev) : update;
  patchAskSession(threadId, { messages, ...(opts?.hydrated === undefined ? {} : { hydrated: opts.hydrated }) });
  return messages;
}

export function setAskDraft(threadId: string, draft: string) {
  patchAskSession(threadId, { draft });
}

/** Marks a turn as in flight and stores the handle that can stop it. */
export function beginAskStream(threadId: string, abort: AbortController) {
  patchAskSession(threadId, { streaming: true, abort });
}

export function endAskStream(threadId: string) {
  patchAskSession(threadId, { streaming: false, abort: null });
}

/** Stop the in-flight turn from any surface. Returns true if there was one. */
export function stopAskStream(threadId: string): boolean {
  const s = getAskSession(threadId);
  if (!s.abort) return false;
  s.abort.abort();
  return true;
}

/** Any thread currently streaming — the shell uses this to show a live marker. */
export function streamingThreadIds(): string[] {
  return [...sessions.values()].filter((s) => s.streaming).map((s) => s.threadId);
}

/** Drop a thread's volatile state (deleted, archived, or scope changed away). */
export function clearAskSession(threadId: string) {
  const s = sessions.get(threadId);
  if (s?.streaming) return; // never orphan a live turn
  sessions.delete(threadId);
  emit(threadId);
  listeners.delete(threadId);
}

/**
 * Move volatile state from a placeholder key onto the real thread.
 *
 * Before the first turn there is no thread yet, so a half-typed line lives
 * under a placeholder ("_none"). The moment a thread exists, that line — and
 * anything already on screen — has to belong to it, or opening Ask from the
 * quick panel would lose what you were writing. Never overwrites real content
 * already on the target thread.
 */
export function adoptAskSession(from: string, to: string): AskSession {
  if (from === to) return getAskSession(to);
  const src = sessions.get(from);
  if (!src) return getAskSession(to);
  const dst = getAskSession(to);
  const next: AskSession = {
    threadId: to,
    messages: dst.messages.length ? dst.messages : src.messages,
    hydrated: dst.hydrated || src.hydrated,
    draft: dst.draft || src.draft,
    streaming: dst.streaming || src.streaming,
    abort: dst.abort ?? src.abort,
  };
  sessions.set(to, next);
  if (!src.streaming) {
    sessions.delete(from);
    emit(from);
  }
  emit(to);
  return next;
}

/** Tests only. */
export function __resetAskSessions() {
  sessions.clear();
  listeners.clear();
}
