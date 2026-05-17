// Tiny markdown helpers. We deliberately do NOT pull in a full markdown lib —
// the design rule is "structured output first, prose second". These are only for
// stripping accidental markdown from legacy briefings until they get re-structured.

const BOLD = /\*\*(.+?)\*\*/g;
const ITAL = /(^|\s)\*(.+?)\*(?=\s|$)/g;
const HEADING = /^#{1,6}\s+/gm;
const BULLET = /^\s*[-*]\s+/gm;
const CODE = /`([^`]+)`/g;

export function stripMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(BOLD, "$1")
    .replace(ITAL, "$1$2")
    .replace(HEADING, "")
    .replace(BULLET, "• ")
    .replace(CODE, "$1")
    .trim();
}
