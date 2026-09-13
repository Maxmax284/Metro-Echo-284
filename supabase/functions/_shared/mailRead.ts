// mailRead — turning mail into one conclusion instead of a card per message.
//
// Doctrine:
//   - A message arriving is not news. What matters is how many of them are
//     actually waiting on this person, said in one line.
//   - Silence is a valid answer. An empty inbox says nothing at all.
// Pure module: no IO, no Deno globals.

export type MailHeader = { name?: string; value?: string };

export type MailItem = {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  date: string | null;
  snippet: string;
  unread: boolean;
};

export function headerValue(headers: MailHeader[] | undefined, name: string): string {
  const hit = (headers ?? []).find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase());
  return (hit?.value ?? "").trim();
}

/** "Dani Rivera <dani@example.com>" → a name a person recognises. */
export function displayName(from: string): string {
  const angled = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (angled) return angled[1].trim();
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return address.split("@")[0].replace(/[._-]+/g, " ").trim() || address;
}

export function emailAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

export function toMailItem(msg: {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: MailHeader[] };
}): MailItem {
  const headers = msg.payload?.headers;
  const from = headerValue(headers, "From");
  const rawDate = headerValue(headers, "Date");
  const parsed = rawDate ? new Date(rawDate) : null;
  return {
    id: String(msg.id ?? ""),
    threadId: String(msg.threadId ?? msg.id ?? ""),
    from: emailAddress(from),
    fromName: displayName(from),
    subject: headerValue(headers, "Subject") || "(no subject)",
    date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    snippet: (msg.snippet ?? "").trim(),
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

/**
 * One line, or nothing. Never a count of everything in the mailbox — only what
 * is unread and addressed to this person.
 */
export function mailConclusion(items: MailItem[]): string | null {
  const waiting = items.filter((i) => i.unread);
  if (waiting.length === 0) return null;
  if (waiting.length === 1) return `${waiting[0].fromName} is waiting on a reply.`;
  const names = [...new Set(waiting.map((i) => i.fromName))];
  if (names.length === 1) return `${names[0]} sent ${waiting.length} that are waiting on you.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are waiting on a reply.`;
  return `${waiting.length} are waiting on you, including ${names[0]} and ${names[1]}.`;
}

/** The Gmail search Echo uses. Deliberately narrow: not "everything unread". */
export const MAIL_QUERY = "is:unread -in:chats -category:promotions -category:social";

/**
 * A question turned into a narrow Gmail search. Never "give me the inbox":
 * words a person actually said, recent mail only, no bulk categories.
 */
export function mailSearchQuery(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !MAIL_STOPWORDS.has(w))
    .slice(0, 6);
  const base = "-in:chats -category:promotions -category:social newer_than:60d";
  if (words.length === 0) return `${MAIL_QUERY} ${base.replace("-in:chats ", "")}`.trim();
  return `${base} (${words.map((w) => (w.includes("@") ? `from:${w}` : w)).join(" OR ")})`;
}

const MAIL_STOPWORDS = new Set([
  "the", "and", "about", "what", "did", "say", "said", "anything", "important",
  "mail", "email", "from", "for", "with", "that", "this", "any", "was", "were",
  "have", "has", "does", "there", "where", "when", "who", "regarding", "please",
  "find", "search", "look", "check", "tell", "know", "you", "your", "echo",
]);

/** One line of an answer to a mail question, or nothing when there is nothing. */
export function mailAnswer(question: string, items: MailItem[]): string | null {
  if (items.length === 0) return null;
  const first = items[0];
  const rest = items.length - 1;
  const tail = rest > 0 ? ` ${rest} other${rest === 1 ? "" : "s"} touch on it.` : "";
  return `${first.fromName} wrote "${first.subject}".${tail}`;
}


/** Plain text out of a Gmail payload, preferring text/plain over HTML. */
export function plainTextFromPayload(payload: unknown): string {
  const seen: string[] = [];
  const walk = (part: unknown) => {
    const p = part as {
      mimeType?: string;
      body?: { data?: string };
      parts?: unknown[];
    } | null;
    if (!p) return;
    if (p.body?.data && (p.mimeType === "text/plain" || p.mimeType === "text/html")) {
      seen.push(`${p.mimeType}\u0000${p.body.data}`);
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  const pick = seen.find((s) => s.startsWith("text/plain")) ?? seen[0];
  if (!pick) return "";
  const data = pick.split("\u0000")[1] ?? "";
  const decoded = decodeBase64Url(data);
  return pick.startsWith("text/html") ? stripHtml(decoded) : decoded;
}

export function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** RFC 2047 for non-ASCII headers; base64url for the whole message. */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  bytes.forEach((b) => (out += String.fromCharCode(b)));
  return btoa(out);
}

export function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${b64(value)}?=`;
}

export function buildRawReply(input: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) lines.push(`References: ${input.references}`);
  lines.push("", input.body);
  return b64(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A reply subject that does not stack "Re: Re: Re:". */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}
