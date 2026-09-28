// worldFollowUps — what a live-world answer honestly offers next.
//
// An answer Echo really fetched from the web carries its provenance in the
// message metadata. From that provenance alone this module decides which
// follow-ups exist: keep watching (a real watch, never a claim), show the
// affected areas (the next question in the same thread), and where the answer
// came from. No provenance, no chips — Echo never offers to watch something
// it cannot name.
//
// Pure module: no IO, so the chips and the tests read one contract.

export type WorldSource = { host: string; url: string; title?: string | null };

export type LiveWorldMeta = {
  provenance?: string;
  /** "web_page" when one named page was read, "web_search" for the open web. */
  source?: string;
  url?: string | null;
  question?: string | null;
  /** True when the answer itself came from starting a page watch. */
  watching?: boolean;
  checked_at?: string | null;
  sources?: WorldSource[];
} | null | undefined;

export function isLiveWorldAnswer(meta: LiveWorldMeta): boolean {
  return (
    !!meta &&
    meta.provenance === "web" &&
    (meta.source === "web_page" || meta.source === "web_search")
  );
}

export type WatchTarget =
  | { mode: "page"; url: string; question: string }
  | { mode: "topic"; question: string };

/**
 * What "Keep me updated" would really watch. A page answer watches that page;
 * a topic answer watches the question itself. No target, no chip.
 */
export function watchTargetFor(meta: LiveWorldMeta): WatchTarget | null {
  if (!isLiveWorldAnswer(meta)) return null;
  const question = String(meta?.question ?? "").trim();
  if (meta?.source === "web_page" && meta?.url) {
    const url = String(meta.url);
    return { mode: "page", url, question: question || url };
  }
  if (question.length >= 3) return { mode: "topic", question };
  return null;
}

/**
 * The follow-up that asks where this is happening. The question rides along
 * so the ask still makes sense turns later, when the thread has moved on.
 */
export function affectedAreasPrompt(meta: LiveWorldMeta): string {
  const q = String(meta?.question ?? "").trim().replace(/[?.!\s]+$/, "");
  const tail = "Name the places, worst first, and say where that came from.";
  return q ? `Which areas are affected by “${q}”? ${tail}` : `Which areas are affected? ${tail}`;
}

/** Where the answer came from, as tappable chips. Named sources only. */
export function sourceChips(meta: LiveWorldMeta, max = 3): WorldSource[] {
  if (!isLiveWorldAnswer(meta)) return [];
  const listed = Array.isArray(meta?.sources)
    ? meta!.sources!.filter((s): s is WorldSource => !!s && !!s.host && !!s.url)
    : [];
  if (listed.length) return listed.slice(0, max);
  if (meta?.source === "web_page" && meta?.url) {
    try {
      const host = new URL(String(meta.url)).hostname.replace(/^www\./, "");
      return host ? [{ host, url: String(meta.url) }] : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** "just now" / "n min ago" / "n hours ago" — null when there is no honest time. */
export function freshnessWord(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins === 1 ? "a minute ago" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
}

/**
 * A declined offer stays declined for that answer. Keyed by the message when
 * it has an id, by the question fingerprint when it does not.
 */
export function followUpDismissKey(
  messageId: string | undefined,
  question: string | null | undefined,
): string {
  const q = String(question ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
  return `vanta.world-followups.dismissed:${messageId ?? `q:${q}`}`;
}
