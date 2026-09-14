// sherlockOutside — the words Sherlock is allowed to say about mail and files.
//
// Doctrine held here:
//   - Mail and files are read as headers and names. A subject line and a file
//     name are what a read gets; the inside of either stays a separate yes.
//   - Not connected is said out loud. Sherlock never answers "no emails about
//     that" when the truth is "I cannot see your mail".
// Pure module: no IO, no Deno globals.

export type OutsideStatus = "read" | "not_connected" | "needs_you" | "failed";

export type OutsideFile = {
  id: string;
  name: string;
  kind: string;
  modifiedAt: string | null;
  link: string | null;
};

const STOPWORDS = new Set([
  "the", "and", "about", "what", "did", "say", "said", "anything", "any",
  "email", "emails", "mail", "file", "files", "drive", "doc", "docs", "document",
  "from", "for", "with", "that", "this", "was", "were", "have", "has", "does",
  "there", "where", "when", "who", "how", "why", "regarding", "please", "find",
  "search", "look", "check", "tell", "know", "you", "your", "echo", "sherlock",
  "have", "into", "over", "some", "show", "give", "get", "got", "his", "her",
]);

/** The words worth searching a Drive by name for. Empty means "recent files". */
export function outsideTerms(question: string, max = 3): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, max);
}

/** One term for a Drive name search, or "" when the question carried none. */
export function outsideTerm(question: string): string {
  return outsideTerms(question, 1)[0] ?? "";
}

/** A mail header as a grounded context line. Never the body. */
export function mailContextLine(
  item: { id: string; fromName: string; subject: string; snippet: string; unread: boolean },
  whenText: string,
): string {
  const parts = [
    `(mail:${item.id}) ${item.subject || "(no subject)"}`,
    `from ${item.fromName || "unknown sender"}`,
    whenText,
  ];
  if (item.unread) parts.push("unread");
  if (item.snippet) parts.push(item.snippet.slice(0, 160));
  return parts.join(" · ");
}

/** A file listing line: name, kind, when it changed. Never contents. */
export function driveContextLine(f: OutsideFile, whenText: string): string {
  const parts = [`(file:${f.id}) ${f.name}`, f.kind, `changed ${whenText}`];
  if (f.link) parts.push(f.link);
  return parts.join(" · ");
}

/**
 * The honest line about a source Sherlock could not read. Returns null when
 * the source was read fine — silence needs no explanation.
 */
export function outsideNote(service: "Gmail" | "Drive", status: OutsideStatus): string | null {
  if (status === "read") return null;
  if (status === "not_connected") {
    return `(source) ${service} is not switched on for this account, so no ${
      service === "Gmail" ? "mail was" : "files were"
    } read. Say that plainly rather than answering as if it were empty.`;
  }
  if (status === "needs_you") {
    return `(source) ${service} needs signing in again, so it could not be read. Say that rather than answering as if it were empty.`;
  }
  return `(source) ${service} could not be reached on this read. Say that rather than answering as if it were empty.`;
}
