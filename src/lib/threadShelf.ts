// threadShelf — pure rules behind the Ask thread rail.
//
// Every judgement the rail makes lives here so it can be tested instead of
// eyeballed: what counts as unread, how a day shelf is labelled, what a pinned
// thread looks like shrunk to two characters, when a situation has gone quiet
// enough to be worth asking "continue, or start fresh?", and whether a touch
// gesture was really an edge swipe.
import { SITUATION_IDLE_MS } from "@/lib/threadRouting";
import { threadLabel, type AskThread } from "@/lib/askThreads";

/* ------------------------------------------------------------------ unread */

const SEEN_KEY = "vanta.ask.seen";

type SeenMap = Record<string, string>;

export function readSeen(): SeenMap {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

export function writeSeen(map: SeenMap): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* private mode — unread marks are a convenience, never evidence */
  }
}

/** Remember that this thread was read up to now. */
export function markSeen(id: string, at = new Date().toISOString()): SeenMap {
  const next = { ...readSeen(), [id]: at };
  writeSeen(next);
  return next;
}

/**
 * A thread is unread when it moved after the last time this device looked at
 * it. A thread never looked at is not shouted about — only movement is news,
 * so an unseen thread counts as unread solely once it has activity of its own.
 */
export function isUnread(
  t: Pick<AskThread, "id" | "last_message_at" | "updated_at" | "created_at">,
  seen: SeenMap,
): boolean {
  const moved = t.last_message_at;
  if (!moved) return false;
  const at = seen[t.id];
  if (!at) return moved > t.created_at;
  return moved > at;
}

export function unreadCount(
  list: Pick<AskThread, "id" | "last_message_at" | "updated_at" | "created_at">[],
  seen: SeenMap,
): number {
  return list.filter((t) => isUnread(t, seen)).length;
}

/* ------------------------------------------------------------- day grouping */

export type DayGroup = { label: string; threads: AskThread[] };

/** Which shelf a moment belongs on, read in the person's own local days. */
export function dayBucket(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Earlier";
  const then = new Date(iso);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(then)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  if (days < 30) return "Earlier this month";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Earlier this week", "Earlier this month", "Older", "Earlier"];

/**
 * Threads shelved by the day they last moved. Order follows time, never
 * alphabet, and empty shelves never render.
 */
export function groupByDay(list: AskThread[], now = Date.now()): DayGroup[] {
  const buckets = new Map<string, AskThread[]>();
  for (const t of list) {
    const label = dayBucket(t.last_message_at ?? t.updated_at, now);
    const arr = buckets.get(label);
    if (arr) arr.push(t);
    else buckets.set(label, [t]);
  }
  return BUCKET_ORDER.filter((l) => buckets.get(l)?.length).map((label) => ({
    label,
    threads: buckets.get(label)!,
  }));
}

/* ---------------------------------------------------------- pinned initials */

/**
 * A pinned thread shrunk to something recognisable on a 48px strip: first
 * letters of the first two words, or the first two characters of one word.
 */
export function threadInitials(t: AskThread): string {
  const label = threadLabel(t);
  const words = label.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ---------------------------------------------- continue vs start fresh */

export type ColdOffer = { quietFor: string };

/**
 * Whether a thread has been quiet long enough that continuing it should be a
 * deliberate choice rather than an accident. Uses the same idle line as the
 * inbound router, so Ask and Telegram agree on when a situation went cold.
 */
export function coldOffer(
  lastMessageAt: string | null | undefined,
  now = Date.now(),
): ColdOffer | null {
  if (!lastMessageAt) return null;
  const idle = now - new Date(lastMessageAt).getTime();
  if (!Number.isFinite(idle) || idle < SITUATION_IDLE_MS) return null;
  const hours = Math.floor(idle / 3600000);
  if (hours < 24) return { quietFor: `${hours} hours` };
  const days = Math.round(hours / 24);
  return { quietFor: days === 1 ? "a day" : `${days} days` };
}

/* -------------------------------------------------------------- edge swipe */

export const EDGE_ZONE = 28;
export const SWIPE_MIN = 56;

/**
 * True only for a deliberate pull in from the left edge: started at the edge,
 * travelled far enough rightwards, and stayed more horizontal than vertical so
 * an ordinary scroll never opens the thread list.
 */
export function edgeSwipeOpens(g: { startX: number; dx: number; dy: number }): boolean {
  if (g.startX > EDGE_ZONE) return false;
  if (g.dx < SWIPE_MIN) return false;
  return Math.abs(g.dy) < Math.abs(g.dx) * 0.7;
}
