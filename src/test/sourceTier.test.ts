import { describe, expect, it } from "vitest";
import { sourceTier } from "@/lib/sourceTier";

describe("sourceTier", () => {
  it("files the person's own records as theirs, not as web", () => {
    expect(sourceTier("internal").tier).toBe("yours");
  });
  it("keeps the tier through a cached read", () => {
    expect(sourceTier("open-meteo:cached")).toEqual({ tier: "official", registered: true, cached: true });
  });
  it("reddit through search is community, not web", () => {
    expect(sourceTier("reddit-serpapi").tier).toBe("community");
  });
  it("a name that merely contains 'gov' is never promoted to official", () => {
    expect(sourceTier("govnews-blog")).toEqual({ tier: "web", registered: false, cached: false });
  });
});
