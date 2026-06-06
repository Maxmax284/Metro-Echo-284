// briefSensitivity — pre-export scan of a draft brief.
// Reuses Sherlock's heuristic detector. Flags categories per section so the
// user gets a localized "this part might be sensitive" review before approving.
import type { Brief } from "@/lib/briefs";
import { detectSensitive, SENSITIVE_LABEL, type SensitiveCategory } from "@/lib/sherlock/sensitive";

export type SensitiveHit = {
  section_id: string;
  heading?: string;
  categories: SensitiveCategory[];
  excerpt: string;
};

export type SensitivityReport = {
  any: boolean;
  hits: SensitiveHit[];
  category_summary: { category: SensitiveCategory; label: string; count: number }[];
};

function bodyToText(body: any): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (Array.isArray(body)) {
    return body.map((x) => (typeof x === "string" ? x : x?.what ?? x?.decision ?? JSON.stringify(x))).join(" \n ");
  }
  if (typeof body === "object") {
    return [body.decision, body.why].filter(Boolean).join(" — ");
  }
  return String(body);
}

export function scanBriefSensitivity(brief: Brief): SensitivityReport {
  const hits: SensitiveHit[] = [];
  const catCounts = new Map<SensitiveCategory, number>();

  for (const section of brief.sections ?? []) {
    const text = bodyToText(section.body);
    if (!text.trim()) continue;
    const res = detectSensitive(text);
    if (res.sensitive) {
      hits.push({
        section_id: section.id,
        heading: section.heading,
        categories: res.categories,
        excerpt: text.slice(0, 140) + (text.length > 140 ? "…" : ""),
      });
      for (const c of res.categories) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
  }

  // Also scan the title + subtitle.
  const headText = `${brief.title} ${brief.subtitle ?? ""}`;
  const headRes = detectSensitive(headText);
  if (headRes.sensitive) {
    hits.unshift({
      section_id: "__title__",
      heading: "Title",
      categories: headRes.categories,
      excerpt: brief.title,
    });
    for (const c of headRes.categories) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }

  return {
    any: hits.length > 0,
    hits,
    category_summary: Array.from(catCounts.entries()).map(([category, count]) => ({
      category, label: SENSITIVE_LABEL[category], count,
    })),
  };
}
