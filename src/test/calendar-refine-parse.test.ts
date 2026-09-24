import { describe, expect, it } from "vitest";
import { parseCalendarRefinement } from "../../supabase/functions/_shared/calendarRefineParse";

describe("calendar refinement parse", () => {
  it("reads the Island hospital correction", () => {
    const f = parseCalendarRefinement("The title name is Island hospital appointment event is consult with local doctor for Ritalin and the time is 1:00 p.m.");
    expect(f.find((x) => x.field === "title")?.after).toBe("Island hospital appointment");
    expect(f.find((x) => x.field === "description")?.after).toBe("consult with local doctor for Ritalin");
  });
  it("ignores ordinary chat", () => {
    expect(parseCalendarRefinement("what's my gate status")).toEqual([]);
  });
});
