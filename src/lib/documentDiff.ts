// documentDiff — compare two versions of a document, descriptively.
//
// Doctrine: descriptive, source-grounded, no verdicts. The diff reports what
// the text says changed and flags where it cannot tell. It never advises, never
// scores, and never claims a legal consequence.
//
// Pure functions only, so this is fully testable without a document.

export type DiffOp = "same" | "added" | "removed";

export type DiffLine = { op: DiffOp; text: string };

export type ChangeKind = "date" | "amount" | "party" | "obligation" | "other";

export type NotedChange = {
  kind: ChangeKind;
  op: Exclude<DiffOp, "same">;
  text: string;
};

export type VersionDiff = {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** Highlights, grouped by what kind of thing moved. */
  noted: NotedChange[];
  /** Plain sentences about what the diff cannot settle. */
  uncertainty: string[];
};

const DATE_RE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,3}\s+(?:days?|weeks?|months?|years?))\b/i;
const AMOUNT_RE = /(?:[$€£฿]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|gbp|thb|baht|dollars?)\b|\b\d+(?:\.\d+)?\s?%)/i;
const PARTY_RE =
  /\b(party|parties|client|contractor|vendor|supplier|licensor|licensee|landlord|tenant|employer|employee|company|between)\b/i;
const OBLIGATION_RE = /\b(shall|must|will|agrees to|is responsible for|required to|undertakes)\b/i;

export function classifyLine(text: string): ChangeKind {
  if (DATE_RE.test(text)) return "date";
  if (AMOUNT_RE.test(text)) return "amount";
  if (OBLIGATION_RE.test(text)) return "obligation";
  if (PARTY_RE.test(text)) return "party";
  return "other";
}

function normalizeLines(body: string | null | undefined): string[] {
  return (body ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Longest-common-subsequence line diff. Small documents only, which is what a contract is. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  /* Guard rails: an enormous body degrades to a coarse compare rather than
     locking the tab up. */
  if (n * m > 4_000_000) {
    return [
      ...before.map((text) => ({ op: "removed" as const, text })),
      ...after.map((text) => ({ op: "added" as const, text })),
    ];
  }
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ op: "same", text: before[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ op: "removed", text: before[i] });
      i++;
    } else {
      out.push({ op: "added", text: after[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "removed", text: before[i++] });
  while (j < m) out.push({ op: "added", text: after[j++] });
  return out;
}

export function compareVersions(
  beforeBody: string | null | undefined,
  afterBody: string | null | undefined,
): VersionDiff {
  const before = normalizeLines(beforeBody);
  const after = normalizeLines(afterBody);
  const lines = diffLines(before, after);
  const added = lines.filter((l) => l.op === "added").length;
  const removed = lines.filter((l) => l.op === "removed").length;

  const noted: NotedChange[] = lines
    .filter((l) => l.op !== "same")
    .map((l) => ({ kind: classifyLine(l.text), op: l.op as Exclude<DiffOp, "same">, text: l.text }))
    .filter((c) => c.kind !== "other");

  const uncertainty: string[] = [];
  if (before.length === 0 || after.length === 0) {
    uncertainty.push("One of these versions has no readable text, so the comparison is incomplete.");
  }
  if (added > 0 && removed > 0) {
    uncertainty.push(
      "Reworded lines show up as one removal plus one addition. Vanta does not guess which pairs belong together.",
    );
  }
  if (noted.some((c) => c.kind === "amount")) {
    uncertainty.push("Amounts changed in the text. Vanta reports the wording, not the arithmetic.");
  }
  if (noted.length === 0 && (added > 0 || removed > 0)) {
    uncertainty.push("Text changed, but nothing that reads like a date, amount, party or obligation.");
  }
  return { lines, added, removed, noted, uncertainty };
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  date: "Dates",
  amount: "Amounts",
  party: "Parties and names",
  obligation: "Obligations",
  other: "Other text",
};

/** One plain headline for the compare view. Never a verdict. */
export function diffHeadline(d: VersionDiff): string {
  if (d.added === 0 && d.removed === 0) return "No text differences between these two versions.";
  const parts: string[] = [];
  if (d.added) parts.push(`${d.added} ${d.added === 1 ? "line" : "lines"} added`);
  if (d.removed) parts.push(`${d.removed} ${d.removed === 1 ? "line" : "lines"} removed`);
  return `${parts.join(", ")}.`;
}
