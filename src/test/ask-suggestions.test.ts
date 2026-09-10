import { describe, expect, it } from "vitest";
import { askSuggestions, type AskSuggestionState } from "@/lib/askSuggestions";

const quiet: AskSuggestionState = {
  changesToday: 0,
  waitingOnYou: 0,
  openPromises: 0,
  nextEvent: null,
  noticed: 0,
};

describe("askSuggestions", () => {
  it("stays silent when nothing is on record", () => {
    expect(askSuggestions(quiet)).toEqual([]);
  });

  it("leads with what waits on the user", () => {
    const out = askSuggestions({ ...quiet, waitingOnYou: 2, changesToday: 5 });
    expect(out[0].id).toBe("waiting");
  });

  it("names the next event in the chip", () => {
    const out = askSuggestions({
      ...quiet,
      nextEvent: { title: "ADHD appointment", startsAt: "2026-09-11T14:00:00Z" },
    });
    expect(out[0].label).toContain("ADHD appointment");
  });

  it("never shows more than three", () => {
    const out = askSuggestions({
      changesToday: 3,
      waitingOnYou: 1,
      openPromises: 4,
      nextEvent: { title: "Flight to Tokyo", startsAt: "2026-09-12T02:00:00Z" },
      noticed: 2,
    });
    expect(out).toHaveLength(3);
  });
});
