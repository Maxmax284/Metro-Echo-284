// markdownText.ts — shared plain-text cleanup for exported documents.
// Drafts come back as light Markdown. Exports render as PDF or Word, neither of
// which understands Markdown syntax, so raw "**" and escaped "\_" leaked into
// finished files. These helpers strip the syntax and keep the words.

/** Removes backslash escapes ("\_" -> "_", "\*" -> "*"). */
export function unescapeMarkdown(input: string): string {
  return input.replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1");
}

/** Strips inline emphasis and code marks, keeping the text inside. */
export function stripInlineMarkdown(input: string): string {
  return unescapeMarkdown(
    input
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"),
  );
}

export type InlineSpan = { text: string; bold: boolean };

/** Splits a line into runs, marking **bold** spans. Used by the Word export. */
export function inlineSpans(input: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) {
      spans.push({ text: stripInlineMarkdown(input.slice(last, m.index)), bold: false });
    }
    spans.push({ text: stripInlineMarkdown(m[1] ?? m[2] ?? m[3] ?? ""), bold: true });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    spans.push({ text: stripInlineMarkdown(input.slice(last)), bold: false });
  }
  return spans.filter((s) => s.text.length > 0);
}

/** True for "- item", "* item", "• item". */
export function bulletText(line: string): string | null {
  const m = /^\s*[-*•]\s+(.*)$/.exec(line);
  return m ? m[1].trim() : null;
}
