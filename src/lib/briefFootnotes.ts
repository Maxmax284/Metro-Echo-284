// briefFootnotes — assign stable footnote numbers to every receipt in a brief.
// Used by both BriefRenderer (claim → drawer highlight) and BriefPdfDocument
// (superscript footnote → numbered appendix anchor).
import type { Brief, BriefGrounding, BriefSection } from "@/lib/briefs";

export type FootnoteMap = {
  // ordered unique receipts with their assigned number (1-indexed)
  ordered: Array<{ n: number; ref: BriefGrounding; key: string }>;
  // key = `${kind}:${id}` → number
  byKey: Map<string, number>;
};

export type ClaimRef = {
  // unique within brief — used as DOM id + PDF anchor + highlight key
  claimId: string;
  sectionId: string;
  heading?: string;
  receipts: BriefGrounding[];
  numbers: number[]; // footnote numbers for this claim
};

const keyOf = (r: BriefGrounding) => `${r.kind}:${r.id}`;

function collectClaimReceipts(section: BriefSection): Array<{ key: string; receipts: BriefGrounding[] }> {
  const out: Array<{ key: string; receipts: BriefGrounding[] }> = [];
  const sectionFallback = section.receipts ?? [];

  switch (section.kind) {
    case "list":
    case "timeline":
    case "receipts": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      items.forEach((it, i) => {
        const receipts: BriefGrounding[] | undefined =
          typeof it === "object" ? it?.receipts : undefined;
        out.push({ key: `${section.id}:${i}`, receipts: receipts ?? sectionFallback });
      });
      break;
    }
    case "decision": {
      const body = section.body ?? {};
      out.push({ key: `${section.id}:decision`, receipts: body.receipts ?? sectionFallback });
      break;
    }
    case "prose":
    case "pull_quote":
    default: {
      const receipts =
        typeof section.body === "object" ? section.body?.receipts : undefined;
      out.push({ key: `${section.id}:prose`, receipts: receipts ?? sectionFallback });
      break;
    }
  }
  return out;
}

export function buildFootnotes(brief: Brief): {
  footnotes: FootnoteMap;
  claims: ClaimRef[];
} {
  const ordered: FootnoteMap["ordered"] = [];
  const byKey = new Map<string, number>();

  const assign = (refs: BriefGrounding[] | undefined): number[] => {
    if (!refs || refs.length === 0) return [];
    const nums: number[] = [];
    for (const r of refs) {
      if (!r?.id || !r?.kind) continue;
      const k = keyOf(r);
      let n = byKey.get(k);
      if (!n) {
        n = ordered.length + 1;
        byKey.set(k, n);
        ordered.push({ n, ref: r, key: k });
      }
      if (!nums.includes(n)) nums.push(n);
    }
    return nums;
  };

  const claims: ClaimRef[] = [];
  for (const section of brief.sections) {
    const claimReceipts = collectClaimReceipts(section);
    for (const c of claimReceipts) {
      const numbers = assign(c.receipts);
      claims.push({
        claimId: c.key,
        sectionId: section.id,
        heading: section.heading,
        receipts: c.receipts ?? [],
        numbers,
      });
    }
  }
  // also fold in any appendix-only receipts at the tail
  assign(brief.appendix_receipts);

  return { footnotes: { ordered, byKey }, claims };
}

// Convert a number to small superscript glyphs (PDF-safe).
const SUP_MAP: Record<string, string> = {
  "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3", "4": "\u2074",
  "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
};
export function toSuperscript(nums: number[]): string {
  if (!nums.length) return "";
  return nums
    .map((n) => String(n).split("").map((d) => SUP_MAP[d] ?? d).join(""))
    .join("\u02D9"); // small dot separator
}

export function footnoteAnchorId(n: number): string {
  return `fn-${n}`;
}

export function footnoteSrcId(n: number): string {
  return `#fn-${n}`;
}

export function claimAnchorId(claimId: string): string {
  return `claim-${claimId}`;
}
