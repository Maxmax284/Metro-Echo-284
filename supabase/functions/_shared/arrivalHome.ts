// arrivalHome — where an unsorted arrival most likely belongs.
//
// Pure and deterministic: word overlap between the arrival and each open
// project's title/summary. No AI, no scoring model, no database. It only
// suggests; filing is always the person's tap. Below the bar it returns null,
// and the caller says "not sure" instead of guessing.

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","at","by","with",
  "is","are","be","this","that","it","as","from","into","my","our","your",
  "project","brief","note","notes","update","updates","new","just","some",
]);

export function homeTokens(text: string): string[] {
  return Array.from(
    new Set(
      (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

export type HomeProject = { id: string; title: string; summary?: string | null };
export type HomeSuggestion = { projectId: string; title: string; score: number };

/**
 * Best project for this text, or null. A title word counts double; one title
 * word is enough, summary-only matches need two. Ties are refused — two equally
 * good homes means we don't know.
 */
export function suggestHome(text: string, projects: HomeProject[]): HomeSuggestion | null {
  const hay = new Set(homeTokens(text));
  if (hay.size === 0 || projects.length === 0) return null;
  const scored = projects
    .map((p) => {
      const titleHits = homeTokens(p.title).filter((t) => hay.has(t)).length;
      const summaryHits = homeTokens(p.summary ?? "")
        .filter((t) => hay.has(t) && !homeTokens(p.title).includes(t)).length;
      return { projectId: p.id, title: p.title, score: titleHits * 2 + summaryHits };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0];
}
