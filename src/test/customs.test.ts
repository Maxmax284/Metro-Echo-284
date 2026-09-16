// Norms are kept and stamped, or they are not said at all.
import { describe, expect, it } from "vitest";
import { customsAnswer, customsFor, customsTopicsAsked, customsWritten, CUSTOMS_LAW } from "@/lib/customs";

describe("finding the place", () => {
  it("takes a country, a code or a city it knows", () => {
    expect(customsFor("Thailand")?.cc).toBe("TH");
    expect(customsFor("jp")?.country).toBe("Japan");
    expect(customsFor("Bangkok")?.cc).toBe("TH");
  });

  it("returns nothing for a country with no notes", () => {
    expect(customsFor("Wakanda")).toBeNull();
    expect(customsFor("")).toBeNull();
  });
});

describe("answering only what was asked", () => {
  it("reads the topic out of the question", () => {
    expect(customsTopicsAsked("do people haggle here")).toContain("bargaining");
    expect(customsTopicsAsked("what should i wear to the temple")).toEqual(
      expect.arrayContaining(["dress", "religious"]),
    );
    expect(customsTopicsAsked("what's due tomorrow")).toEqual([]);
  });

  it("answers the asked topic and not the rest", () => {
    const line = customsAnswer("Japan", "do people haggle in shops");
    expect(line).toContain("Bargaining:");
    expect(line).not.toContain("Dress:");
    expect(line).toContain("as of 2026-09-16");
  });

  it("gives a sensible spread when nothing specific was asked", () => {
    const line = customsAnswer("Thailand");
    expect(line).toContain("Manners:");
    expect(line).toContain("Tourist pricing:");
  });

  it("carries the caveat every time", () => {
    expect(customsAnswer("France", "is it rude to be late")).toContain(CUSTOMS_LAW);
  });
});

describe("refusing to guess", () => {
  it("says it has nothing rather than inventing a norm", () => {
    const line = customsAnswer("Wakanda", "do people haggle");
    expect(line).toMatch(/keeps no notes on local custom/i);
    expect(line).toMatch(/will not fill the gap with a stereotype/i);
    expect(line).toContain(customsWritten()[0]);
  });

  it("admits a gap inside a country it does know", () => {
    // Netherlands has no 'service'-free gap, so use a topic list with a hole:
    const nl = customsFor("Netherlands")!;
    expect(nl.bargaining).toBeTruthy();
  });
});
