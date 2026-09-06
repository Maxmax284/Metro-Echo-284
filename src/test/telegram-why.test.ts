import { describe, expect, it } from "vitest";
import { replyWhy, replyWhyLine, laneLabel } from "../../supabase/functions/_shared/telegramWhy";

describe("telegram why", () => {
  const now = Date.now();
  const at = new Date(now - 60_000).toISOString();

  it("says which lane a routed message landed in", () => {
    const line = replyWhyLine({ routedTo: "commitments", detectedType: "reminder", at }, now);
    expect(line).toContain("Why this?");
    expect(line).toContain("Read as reminder");
    expect(line).toContain("From This chat");
  });

  it("a read says it read, and names what it read", () => {
    const why = replyWhy({ readOnly: true, usedRecords: ["your calendar", "Commitments"] });
    expect(why?.whatChanged).toContain("this was a read");
    expect(why?.source).toBe("your calendar and Commitments");
  });

  it("an unfiled capture says it is waiting", () => {
    const why = replyWhy({ needsReview: true });
    expect(why?.ifIgnored).toContain("stays in captures");
  });

  it("stays silent when nothing was recorded", () => {
    expect(replyWhy({})).toBeNull();
    expect(replyWhyLine({})).toBeNull();
    expect(replyWhy({ readOnly: true, usedRecords: [] })).toBeNull();
  });

  it("uses human lane names", () => {
    expect(laneLabel("inbox")).toBe("the Inbox");
    expect(laneLabel(null)).toBeNull();
  });
});
