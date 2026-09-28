// webLook — the missing hand. When a fact only exists on a public web page,
// Echo goes and reads that page.
//
// Doctrine:
//   - Native connected source first (calendar, mail, files). Public web last.
//   - Reading is not acting. A read produces a conclusion and a source line.
//     Nothing here books, cancels, submits or logs in anywhere.
//   - Echo cannot sign into a portal. A page behind a login is reported as
//     behind a login, never guessed at.
//   - A watch on a page reports a diff, never a status. "Still the same" is
//     silence, not news.
//
// Pure module: no IO, no Deno globals, so the sweep, the function and the
// tests all read one contract.

export type PageBlock = "not_http" | "private_host" | "too_long" | "bad_url";

/** Only public http(s) addresses. No file://, no localhost, no LAN. */
export function safeUrl(raw: string): { ok: true; url: string } | { ok: false; reason: PageBlock } {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "bad_url" };
  if (text.length > 2000) return { ok: false, reason: "too_long" };
  let u: URL;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
    u = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "not_http" };
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (privateHost) return { ok: false, reason: "private_host" };
  return { ok: true, url: u.toString() };
}

/** Display host, the way a person would say it. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const DROP_TAGS = /<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi;

/** HTML in, readable words out. Deliberately dumb and predictable. */
export function htmlToText(html: string, max = 12_000): string {
  const body = String(html ?? "")
    .replace(DROP_TAGS, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body.slice(0, max);
}

export function pageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(html ?? ""));
  if (!m) return null;
  const t = htmlToText(m[1], 300);
  return t || null;
}

/** True when the page is a sign-in wall rather than the thing we wanted. */
export function looksLikeLogin(html: string, text: string): boolean {
  const hasPasswordField = /type\s*=\s*["']?password/i.test(html);
  const short = text.length < 1500;
  const words = /\b(sign in|log in|login|username|password|forgot your password)\b/i.test(text);
  return hasPasswordField && short && words;
}

/**
 * Stable identity for "the page still says the same thing". Whitespace, order
 * of ads and tracking junk must not count as a change, so we fold the text
 * down to its words before hashing.
 */
export function pageFingerprint(text: string): string {
  const words = String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\d{4,}/g, "#")
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1200);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      h1 = (h1 ^ w.charCodeAt(i)) >>> 0;
      h1 = (h1 * 0x01000193) >>> 0;
    }
    h2 = (h2 + w.length * 31) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${words.length}`;
}

export type PageRead = {
  url: string;
  host: string;
  title: string | null;
  text: string;
  fingerprint: string;
  behind_login: boolean;
  read_at: string;
};

export function readPage(url: string, html: string, now = new Date()): PageRead {
  const text = htmlToText(html);
  return {
    url,
    host: hostLabel(url),
    title: pageTitle(html),
    text,
    fingerprint: pageFingerprint(text),
    behind_login: looksLikeLogin(html, text),
    read_at: now.toISOString(),
  };
}

/** One line naming where a conclusion came from. Provenance, never a wall. */
export function sourceLine(read: Pick<PageRead, "host" | "read_at">, timezone?: string | null): string {
  let when = "just now";
  try {
    when = new Date(read.read_at).toLocaleString("en-US", {
      timeZone: timezone ?? undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    /* fall back to "just now" */
  }
  return `Read from ${read.host} on ${when}.`;
}

export const BLOCK_LINE: Record<PageBlock, string> = {
  bad_url: "That does not look like a web address.",
  not_http: "Echo only reads ordinary web addresses.",
  private_host: "That address is on a private network Echo cannot reach.",
  too_long: "That address is too long to be real.",
};

/** What Echo says when it could not get the page itself. */
export function fetchFailLine(status: number, host: string): string {
  if (status === 401 || status === 403) return `${host} wants a sign-in, so Echo could not read it.`;
  if (status === 404) return `That page is not there any more.`;
  if (status === 429) return `${host} is rate-limiting Echo right now. Worth trying later.`;
  if (status >= 500) return `${host} is having its own problems right now.`;
  return `Echo could not open ${host}.`;
}

/* ------------------------------------------------------- watching a page */

export type WebWatchState = { url: string; fingerprint?: string | null; misses?: number };

export type WebCheck =
  | { changed: false; fingerprint: string }
  | { changed: true; fingerprint: string; outcome: string }
  | { failed: true; outcome: string; behind_login: boolean };

/**
 * A page check. Silence when nothing moved; one plain sentence when it did.
 * The first check has no baseline, so it records one and says nothing.
 */
export function checkPage(prev: WebWatchState, read: PageRead): WebCheck {
  if (read.behind_login) {
    return {
      failed: true,
      behind_login: true,
      outcome: `${read.host} is behind a sign-in, so Echo cannot keep watching it.`,
    };
  }
  const before = (prev.fingerprint ?? "").trim();
  if (!before) return { changed: false, fingerprint: read.fingerprint };
  if (before === read.fingerprint) return { changed: false, fingerprint: read.fingerprint };
  const what = read.title ? `${read.title} (${read.host})` : read.host;
  return {
    changed: true,
    fingerprint: read.fingerprint,
    outcome: `${what} changed since Echo last looked.`,
  };
}

export function webWatchGoal(url: string, why?: string | null): string {
  const host = hostLabel(url);
  const reason = (why ?? "").trim();
  return reason ? `Watch ${host} — ${reason}`.slice(0, 200) : `Watch ${host} for changes`;
}

/* ------------------------------------------------------ watching a topic */

export type SearchHit = { title: string; url: string; snippet: string };

/**
 * Stable identity for "the web's answer to this question is the same". Only
 * the set of pages counts — the same pages in a different order is ranking
 * jitter, not news — so the fingerprint folds the top urls, sorted.
 */
export function searchFingerprint(hits: SearchHit[]): string {
  const keys = hits
    .map((h) =>
      String(h.url ?? "")
        .toLowerCase()
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/+$/, ""),
    )
    .filter(Boolean)
    .sort();
  const joined = keys.join("|");
  let h1 = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h1 = (h1 ^ joined.charCodeAt(i)) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
  }
  return `${h1.toString(16)}-${keys.length}`;
}

export type SearchCheck =
  | { changed: false; fingerprint: string }
  | { changed: true; fingerprint: string; outcome: string };

/**
 * A topic check. Silence while the same pages still answer; one plain sentence
 * when new pages show up. The first check has no baseline, so it records one
 * and says nothing.
 */
export function checkSearch(
  prev: { fingerprint?: string | null },
  query: string,
  hits: SearchHit[],
): SearchCheck {
  const fingerprint = searchFingerprint(hits);
  const before = (prev.fingerprint ?? "").trim();
  if (!before || before === fingerprint) return { changed: false, fingerprint };
  return {
    changed: true,
    fingerprint,
    outcome: `New pages are showing for “${query}”.`,
  };
}

export function webSearchWatchGoal(query: string): string {
  const q = query.trim().replace(/\s+/g, " ");
  return `Watch the web for “${q}”`.slice(0, 200);
}
