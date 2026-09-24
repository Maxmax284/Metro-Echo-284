// Deterministic reading of a correction to a pending calendar proposal.
// The model used to say "I'll update it" without calling the tool, so the
// stored proposal never changed and a later "Yes" approved the stale one.
// These phrases are read here, before the model, so the write always lands.
export type RefineField = { field: "title" | "description" | "location"; after: string };

const STOP = String.raw`(?=\s*(?:,|;|\.(?:\s|$)|\s+(?:and\s+)?(?:the\s+)?(?:time|title|name|description|details|event|location|place)\s+(?:is|should be)\b|$))`;

function grab(text: string, re: RegExp): string | null {
  const m = text.match(re);
  const v = m?.[1]?.trim().replace(/^["'“]|["'”]$/g, "").trim();
  return v && v.length <= 160 ? v : null;
}

export function parseCalendarRefinement(text: string): RefineField[] {
  const t = text.replace(/\s+/g, " ").trim();
  const out: RefineField[] = [];
  const title =
    grab(t, new RegExp(String.raw`\b(?:title(?:\s+name)?|name)\s+(?:is|should be|to)\s+(.+?)` + STOP, "i")) ??
    grab(t, new RegExp(String.raw`\b(?:call it|rename it(?: to)?|called)\s+(.+?)` + STOP, "i"));
  if (title) out.push({ field: "title", after: title });
  const desc = grab(t, new RegExp(String.raw`\b(?:description|details|event|it's for|it is for)\s+(?:is|are|:)?\s*(.+?)` + STOP, "i"));
  if (desc && desc !== title) out.push({ field: "description", after: desc });
  const loc = grab(t, new RegExp(String.raw`\b(?:location|place)\s+(?:is|should be)\s+(.+?)` + STOP, "i"));
  if (loc) out.push({ field: "location", after: loc });
  return out;
}
