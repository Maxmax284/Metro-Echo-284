// Kept facts, stamped and bounded. An unwritten country gets silence, not a guess.
import { describe, expect, it } from "vitest";
import {
  countriesWritten, countryFacts, factsAnswer, haveFactsFor, noFactsWords, topicsAsked,
} from "../../supabase/functions/_shared/countryFacts";

describe("finding the place", () => {
  it("takes a country, a code and a city it was told about", () => {
    expect(countryFacts("Thailand")?.cc).toBe("TH");
    expect(countryFacts("jp")?.country).toBe("Japan");
    expect(countryFacts("Bangkok")?.cc).toBe("TH");
    expect(countryFacts("the states")?.cc).toBe("US");
  });

  it("returns nothing for a country nobody wrote up", () => {
    expect(countryFacts("Paraguay")).toBeNull();
    expect(haveFactsFor("Paraguay")).toBe(false);
    expect(countryFacts(null)).toBeNull();
  });

  it("says which countries it does have when it has to say no", () => {
    const words = noFactsWords("Paraguay");
    expect(words).toContain("no kept notes for Paraguay");
    expect(words).toContain("Thailand");
  });
});

describe("every kept row is complete and stamped", () => {
  it("carries a checked-on day and the basics", () => {
    for (const name of countriesWritten()) {
      const f = countryFacts(name);
      expect(f, name).not.toBeNull();
      expect(f!.checked_on, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f!.phone, name).toMatch(/^\+\d+/);
      expect(f!.plugs.length, name).toBeGreaterThan(0);
      expect(f!.voltage, name).toContain("V");
      expect(["left", "right"], name).toContain(f!.driving);
      expect(f!.tax.length, name).toBeGreaterThan(10);
      expect(f!.tipping.length, name).toBeGreaterThan(10);
    }
  });
});

describe("answering only what was asked", () => {
  it("reads the topic out of the question", () => {
    expect(topicsAsked("what plug do I need there")).toContain("plugs");
    expect(topicsAsked("do I tip in restaurants")).toContain("tipping");
    expect(topicsAsked("is tax included in the price")).toContain("tax");
    expect(topicsAsked("how's the weather")).toEqual([]);
  });

  it("answers the asked topic and not the whole file", () => {
    const line = factsAnswer("Japan", "what plug do I need");
    expect(line).toContain("Plugs A, B");
    expect(line).not.toContain("Tipping:");
  });

  it("gives the usual spread when nothing specific was asked", () => {
    const line = factsAnswer("Thailand");
    expect(line).toContain("Plugs");
    expect(line).toContain("Tipping");
    expect(line).toContain("drive on the left");
  });

  it("carries the emergency number and the caveat", () => {
    const line = factsAnswer("Thailand");
    expect(line).toContain("191");
    expect(line).toContain("not a live feed");
    expect(line).toContain("2026-09-16");
  });

  it("refuses an unwritten country instead of improvising", () => {
    expect(factsAnswer("Paraguay", "what plug")).toContain("no kept notes");
  });
});
