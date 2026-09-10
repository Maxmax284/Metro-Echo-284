// One calendar change, many surfaces. These cover the parts that must behave the
// same whether the user is in Ask, the widget, or Telegram: where the buttons
// live, when the app link is worth showing, and what "already decided" reads as.
import { describe, expect, it } from "vitest";
import {
  buildCalendarProposal,
  calendarFieldLabel,
  calendarProposalNeedsDepth,
  isCalendarProposal,
  refineCalendarProposal,
  settledElsewhereLine,
  withTelegramRef,
  type CalendarFieldChange,
} from "@/lib/calendarProposal";

const move = (after: string): CalendarFieldChange => ({
  field: "time",
  label: calendarFieldLabel("time"),
  before: "2:00 PM",
  after,
});

const proposal = (over: Partial<Parameters<typeof buildCalendarProposal>[0]> = {}) =>
  buildCalendarProposal({
    event: { feed_id: "f1", uid: "u1", starts_at: "2026-09-11T07:00:00Z", ends_at: "2026-09-11T08:00:00Z", title: "Doctor" },
    changes: [move("3:00 PM")],
    writeState: "read_only",
    ...over,
  });

describe("depth is an escape hatch, not the approval path", () => {
  it("keeps an ordinary move inside the conversation", () => {
    expect(calendarProposalNeedsDepth(proposal())).toBe(false);
  });

  it("offers depth when several things collide", () => {
    expect(calendarProposalNeedsDepth(proposal({ conflicts: ["overlaps Standup, 15:00", "overlaps Gym, 15:30"] }))).toBe(true);
  });

  it("offers depth when other people would be notified of a cancellation", () => {
    const p = proposal({
      changes: [{ field: "existence", label: "Event", before: "Doctor", after: null }],
      attendeeCount: 3,
    });
    expect(calendarProposalNeedsDepth(p)).toBe(true);
  });
});

describe("the Telegram message carrying the Yes/No", () => {
  it("remembers where the buttons are without changing the proposal", () => {
    const p = proposal();
    const tagged = withTelegramRef(p, { chat_id: 42, message_id: 7 });
    expect(tagged.telegram).toEqual({ chat_id: 42, message_id: 7 });
    expect(tagged.changes).toEqual(p.changes);
    expect(tagged.version).toBe(p.version);
    expect(isCalendarProposal(tagged)).toBe(true);
  });

  it("survives a refinement so the old buttons can still be retired", () => {
    const tagged = withTelegramRef(proposal(), { chat_id: 42, message_id: 7 });
    const refined = refineCalendarProposal(tagged, [move("3:30 PM")]);
    expect(refined.telegram).toEqual({ chat_id: 42, message_id: 7 });
    expect(refined.version).toBe(tagged.version + 1);
    expect(refined.changes[0].after).toBe("3:30 PM");
    // A refinement is not a write.
    expect(refined.write_state).toBe("read_only");
  });
});

describe("settling in one place settles everywhere", () => {
  it("says what happened, and never claims Google moved", () => {
    expect(settledElsewhereLine("approved")).toBe("Approved in Metro Echo. Nothing changed in Google.");
    expect(settledElsewhereLine("cancelled")).toBe("Dropped in Metro Echo. Nothing changed.");
    expect(settledElsewhereLine("executed")).toBe("Already decided in Metro Echo.");
    for (const status of ["approved", "cancelled", "executed"]) {
      expect(settledElsewhereLine(status).toLowerCase()).not.toContain("synced");
    }
  });
});
