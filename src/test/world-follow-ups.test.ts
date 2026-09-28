import { describe, expect, it } from "vitest";
import {
  affectedAreasPrompt,
  followUpDismissKey,
  freshnessWord,
  isLiveWorldAnswer,
  sourceChips,
  watchTargetFor,
} from "@/lib/worldFollowUps";

describe("what counts as a live-world answer", () => {
  it("needs real web provenance — memory answers never grow follow-ups", () => {
    expect(isLiveWorldAnswer({ provenance: "web", source: "web_search" })).toBe(true);
    expect(isLiveWorldAnswer({ provenance: "web", source: "web_page" })).toBe(true);
    expect(isLiveWorldAnswer({ provenance: "web", source: "memory" })).toBe(false);
    expect(isLiveWorldAnswer({ source: "web_search" })).toBe(false);
    expect(isLiveWorldAnswer({})).toBe(false);
    expect(isLiveWorldAnswer(null)).toBe(false);
    expect(isLiveWorldAnswer(undefined)).toBe(false);
  });
});

describe("what 'Keep me updated' would really watch", () => {
  it("watches the page for a page answer", () => {
    const target = watchTargetFor({
      provenance: "web",
      source: "web_page",
      url: "https://gov.example/flood-watch",
      question: "the flood watch",
    });
    expect(target).toEqual({ mode: "page", url: "https://gov.example/flood-watch", question: "the flood watch" });
  });

  it("watches the question for a topic answer", () => {
    const target = watchTargetFor({
      provenance: "web",
      source: "web_search",
      question: "bangkok flooding",
    });
    expect(target).toEqual({ mode: "topic", question: "bangkok flooding" });
  });

  it("offers nothing when there is nothing real to watch", () => {
    expect(watchTargetFor({ provenance: "web", source: "web_search", question: "  " })).toBeNull();
    expect(watchTargetFor({ provenance: "web", source: "web_page", url: null, question: null })).toBeNull();
  });
});

describe("the affected-areas follow-up", () => {
  it("carries the original question so the ask still makes sense turns later", () => {
    const prompt = affectedAreasPrompt({
      provenance: "web",
      source: "web_search",
      question: "what's going on with the bangkok flooding?",
    });
    expect(prompt).toContain("bangkok flooding");
    expect(prompt).not.toContain("flooding?“");
    expect(prompt).toMatch(/affected/i);
  });
});

describe("where the answer came from", () => {
  it("names up to three recorded sources, never more", () => {
    const meta = {
      provenance: "web",
      source: "web_search",
      sources: [
        { host: "a.example", url: "https://a.example/1" },
        { host: "b.example", url: "https://b.example/2" },
        { host: "c.example", url: "https://c.example/3" },
        { host: "d.example", url: "https://d.example/4" },
      ],
    };
    expect(sourceChips(meta)).toHaveLength(3);
  });

  it("falls back to the page's own host for a page answer", () => {
    const chips = sourceChips({ provenance: "web", source: "web_page", url: "https://www.gov.example/flood-watch" });
    expect(chips).toEqual([{ host: "gov.example", url: "https://www.gov.example/flood-watch" }]);
  });

  it("shows no source when none was recorded", () => {
    expect(sourceChips({ provenance: "web", source: "web_search" })).toEqual([]);
  });
});

describe("when it was read", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  it("speaks plainly", () => {
    expect(freshnessWord("2026-09-28T11:59:50Z", now)).toBe("just now");
    expect(freshnessWord("2026-09-28T11:40:00Z", now)).toBe("20 min ago");
    expect(freshnessWord("2026-09-28T09:00:00Z", now)).toBe("3 hours ago");
    expect(freshnessWord("2026-09-26T12:00:00Z", now)).toBe("2 days ago");
  });
  it("says nothing when there is no honest time", () => {
    expect(freshnessWord(null, now)).toBeNull();
    expect(freshnessWord("not-a-date", now)).toBeNull();
  });
});

describe("a declined offer stays declined", () => {
  it("keys by the message when it has one, by the question when it does not", () => {
    expect(followUpDismissKey("msg-1", "anything")).toBe("vanta.world-followups.dismissed:msg-1");
    expect(followUpDismissKey(undefined, "Bangkok flooding!!")).toBe(
      "vanta.world-followups.dismissed:q:bangkok flooding",
    );
  });
});
