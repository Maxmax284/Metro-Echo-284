import { describe, expect, it } from "vitest";
import { formatStand, type StandState } from "../../supabase/functions/_shared/workReads";

const base: StandState = {
  waitingOnYou: 0,
  open: 0,
  overdue: 0,
  changed: 0,
  canWait: 0,
  handled: 0,
  topWaiting: null,
};

describe("state compression — where you stand", () => {
  it("says nothing is pressing when nothing is", () => {
    expect(formatStand(base)).toBe("Where you stand: nothing is pressing.");
  });

  it("leads with the decision that is blocked on the person", () => {
    const text = formatStand({ ...base, waitingOnYou: 2, open: 3, overdue: 1, changed: 1 });
    expect(text.split("\n")[0]).toBe(
      "Where you stand: 2 things waiting on your yes, one promise past its date, 2 promises open this week and 1 thing moved today.",
    );
    expect(text).toContain("moved today");
  });

  it("keeps overdue out of the open-this-week count", () => {
    const text = formatStand({ ...base, open: 1, overdue: 1 });
    expect(text).toContain("one promise past its date");
    expect(text).not.toContain("open this week");
  });

  it("names what can wait and what is already handled", () => {
    const text = formatStand({ ...base, canWait: 4, handled: 1 });
    expect(text).toContain("4 things can wait");
    expect(text).toContain("1 thing already handled in the last week.");
  });

  it("offers one next move, never a list", () => {
    const text = formatStand({ ...base, waitingOnYou: 3, topWaiting: "Send the deposit receipt" });
    expect(text.trimEnd().endsWith("Start with: Send the deposit receipt.")).toBe(true);
    expect(text.split("\n").length).toBe(2);
  });

  it("uses singular English for one of anything", () => {
    const text = formatStand({ ...base, waitingOnYou: 1, changed: 1 });
    expect(text).toContain("1 thing waiting on your yes");
    expect(text).toContain("1 thing moved today");
  });
});
