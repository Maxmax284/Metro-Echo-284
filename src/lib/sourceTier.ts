/* Source tiers — structural, not guessed from words. Every source id the
   awareness snapshot writes into sources_used is registered here by name; a
   ":cached" suffix keeps its tier. An unregistered id lands in "web" and is
   flagged unregistered so the board never dresses it up as official. */

export type SourceTier = "yours" | "official" | "local" | "community" | "web" | "ai";

export const SOURCE_TIERS: Record<string, SourceTier> = {
  internal: "yours",
  "open-meteo": "official",
  calendar: "official",
  google_maps: "local",
  serpapi: "web",
  "reddit-serpapi": "community",
  "reddit-public": "community",
  gemini: "ai",
  "awareness-brief": "ai",
};

export function baseSourceId(source: string): string {
  return source.trim().toLowerCase().replace(/:cached$/, "");
}

export function sourceTier(source: string): { tier: SourceTier; registered: boolean; cached: boolean } {
  const id = baseSourceId(source);
  const tier = SOURCE_TIERS[id];
  return { tier: tier ?? "web", registered: Boolean(tier), cached: /:cached$/i.test(source.trim()) };
}
