// A flight typed into a chat box: read it, or ask the one question. Never guess.
import { describe, expect, it } from "vitest";
import { askForDayWords, readDay, readFlightAsk } from "../../supabase/functions/_shared/flightChat";

const TODAY = "2026-09-16"; // a Wednesday

describe("reading the day a person named", () => {
  it("takes a written date", () => {
    expect(readDay("TG601 on 2026-10-03", TODAY)?.on).toBe("2026-10-03");
  });

  it("takes today and tomorrow", () => {
    expect(readDay("flight today", TODAY)?.on).toBe("2026-09-16");
    expect(readDay("flight tomorrow", TODAY)?.on).toBe("2026-09-17");
    expect(readDay("tmrw", TODAY)?.on).toBe("2026-09-17");
  });

  it("takes a month and a day either way round", () => {
    expect(readDay("sep 20", TODAY)?.on).toBe("2026-09-20");
    expect(readDay("20 september", TODAY)?.on).toBe("2026-09-20");
  });

  it("rolls a day already gone into next year rather than the past", () => {
    expect(readDay("march 4", TODAY)?.on).toBe("2027-03-04");
  });

  it("takes month/day as it is written on this side of the water", () => {
    expect(readDay("9/20", TODAY)?.on).toBe("2026-09-20");
  });

  it("takes the next weekday coming", () => {
    expect(readDay("friday", TODAY)?.on).toBe("2026-09-18");
    expect(readDay("wed", TODAY)?.on).toBe("2026-09-16");
  });

  it("names no day when none was named", () => {
    expect(readDay("TG601", TODAY)).toBeNull();
  });
});

describe("what a typed line is asking of the flight desk", () => {
  it("files a number with a day", () => {
    expect(readFlightAsk("TG601 friday", TODAY)).toEqual({
      kind: "file",
      flight_no: "TG601",
      depart_on: "2026-09-18",
      day_words: "friday",
    });
  });

  it("asks the one question when no day was given", () => {
    expect(readFlightAsk("tg 601", TODAY)).toEqual({ kind: "needs_day", flight_no: "TG601" });
    expect(askForDayWords("TG601")).toMatch(/which day/i);
  });

  it("drops a flight when asked to", () => {
    expect(readFlightAsk("cancel flight TG601", TODAY)).toEqual({ kind: "cancel", flight_no: "TG601" });
  });

  it("ignores a code buried in a long sentence that is not about flying", () => {
    const line = "Ask the IT205 crew about the invoice before we sign anything else off today, please";
    expect(readFlightAsk(line, TODAY)).toBeNull();
  });

  it("still reads a long sentence that says flight", () => {
    const ask = readFlightAsk("my flight TG601 leaves on sep 20, put it on my record", TODAY);
    expect(ask).toEqual({ kind: "file", flight_no: "TG601", depart_on: "2026-09-20", day_words: "sep 20" });
  });

  it("asks nothing of a line with no flight code in it", () => {
    expect(readFlightAsk("what's on today", TODAY)).toBeNull();
  });
});
