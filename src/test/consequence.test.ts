import { describe, expect, it } from "vitest";
import {
  NOTHING_YET,
  actionConsequence,
  closeCommitmentConsequence,
  compactConsequence,
  consequenceRows,
  moveBookingConsequence,
  sendReplyConsequence,
  snoozeCommitmentConsequence,
} from "@/lib/consequence";

describe("consequence preview", () => {
  it("keeps the six sections in a fixed order", () => {
    const rows = consequenceRows(closeCommitmentConsequence({ title: "Send Nikki the roster", dueAt: null }));
    expect(rows.map((r) => r.label)).toEqual([
      "Before",
      "After",
      "What changes",
      "What does not change",
      "What gets notified",
      "What stays reversible",
    ]);
  });

  it("says nobody is notified rather than leaving it blank", () => {
    const rows = consequenceRows(closeCommitmentConsequence({ title: "x", dueAt: null }));
    expect(rows.find((r) => r.label === "What gets notified")?.lines[0]).toMatch(/Nobody/);
  });

  it("moves the due date only when the promise is already late", () => {
    const late = snoozeCommitmentConsequence({
      title: "x",
      dueAt: new Date(Date.now() - 86400000).toISOString(),
      toIso: new Date(Date.now() + 3600000).toISOString(),
      presetLabel: "+1 hour",
    });
    expect(late.changes.join(" ")).toMatch(/due date moves/);
    const future = snoozeCommitmentConsequence({
      title: "x",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      toIso: new Date(Date.now() + 90000000).toISOString(),
      presetLabel: "Next week",
    });
    expect(future.changes.join(" ")).toMatch(/stays where it is/);
  });

  it("never claims a sent reply is reversible", () => {
    const c = sendReplyConsequence({ channel: "Telegram", to: "your paired chat", text: "on my way" });
    expect(c.reversible).toBeNull();
    expect(consequenceRows(c).find((r) => r.label === "What stays reversible")?.lines[0]).toMatch(/can't be undone/);
  });

  it("keeps a booking's money and owner out of the change list", () => {
    const c = moveBookingConsequence({ label: "Pad work 6pm", fromIso: null, toIso: null });
    expect(c.unchanged.join(" ")).toMatch(/Price, payment/);
  });

  it("reports undo for a staged action only when rollback is recorded", () => {
    expect(actionConsequence({ title: "t", risk: "standard", rollback: false }).reversible).toBeNull();
    expect(actionConsequence({ title: "t", risk: "standard", rollback: true }).reversible).toMatch(/undo/);
  });

  it("ends the compact version with the same sentence", () => {
    expect(compactConsequence(closeCommitmentConsequence({ title: "x", dueAt: null }))).toContain(NOTHING_YET);
  });
});
