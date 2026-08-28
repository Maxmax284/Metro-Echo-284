// A sync report has to be news or nothing. These tests hold that line:
// "Synchronized" must never be the whole message.
import { describe, expect, it } from "vitest";
import {
  changeLine,
  changePhrase,
  checkedLabel,
  EMPTY_FEED_ADVICE,
  feedState,
  feedStateLine,
  syncSummary,
  type FeedStatus,
} from "@/lib/calendarSync";

const base: FeedStatus = {
  label: "Personal",
  active: true,
  last_synced_at: new Date().toISOString(),
  last_error: null,
  event_count: 4,
};

describe("feed state", () => {
  it("calls a broken link broken and repeats the real reason", () => {
    const f = { ...base, last_error: "That address does not exist any more." };
    expect(feedState(f)).toBe("broken");
    expect(feedStateLine(f)).toContain("does not exist any more");
  });

  it("separates an empty calendar from a stale one", () => {
    expect(feedState({ ...base, event_count: 0 })).toBe("empty");
    expect(feedState({ ...base, last_synced_at: new Date(Date.now() - 5 * 3_600_000).toISOString() })).toBe("stale");
  });

  it("explains an empty calendar instead of shrugging", () => {
    expect(feedStateLine({ ...base, event_count: 0 })).toContain("No upcoming entries");
    expect(EMPTY_FEED_ADVICE).toMatch(/iCal/);
  });

  it("says what it holds and what changed", () => {
    const line = feedStateLine({ ...base, last_added: 3, last_moved: 1 });
    expect(line).toContain("4 entries");
    expect(line).toContain("3 new, 1 moved");
    expect(line).toContain("checked");
  });

  it("stays silent about changes when the last pass was quiet", () => {
    expect(changePhrase({ last_added: 0, last_moved: 0, last_cancelled: 0 })).toBe("");
  });
});

describe("sync summary", () => {
  it("never reports a bare success", () => {
    const quiet = syncSummary([{ feed: "a", ok: true, label: "Personal", events: 4 }]);
    expect(quiet.title).not.toBe("Synchronized");
    expect(quiet.title).toContain("nothing changed");
    expect(quiet.description).toContain("4 entries");
  });

  it("leads with the diff when something moved", () => {
    const out = syncSummary([{ feed: "a", ok: true, label: "Personal", events: 6, added: 2, moved: 1 }]);
    expect(out.title).toContain("2 new, 1 moved");
  });

  it("explains an empty result rather than claiming success", () => {
    const out = syncSummary([{ feed: "a", ok: true, label: "Personal", events: 0 }]);
    expect(out.title).toContain("nothing came back");
    expect(out.description).toContain("iCal");
  });

  it("surfaces the real failure text when nothing answered", () => {
    const out = syncSummary([{ feed: "a", ok: false, label: "Personal", error: "The calendar refused the link." }]);
    expect(out.title).toContain("Personal");
    expect(out.description).toBe("The calendar refused the link.");
  });

  it("says so plainly when there is nothing to check", () => {
    expect(syncSummary([]).title).toBe("No calendars to check");
  });
});

describe("change lines", () => {
  const at = "2026-09-01T15:00:00.000Z";
  const to = "2026-09-02T15:00:00.000Z";

  it("reads as a sentence, not a record", () => {
    expect(changeLine({ change: "cancelled", title: "Nikki call", old_starts_at: at, new_starts_at: null })).toMatch(
      /^Nikki call is off/,
    );
    expect(changeLine({ change: "moved", title: "Nikki call", old_starts_at: at, new_starts_at: to })).toContain("moved from");
    expect(changeLine({ change: "added", title: null, old_starts_at: null, new_starts_at: to })).toContain("An untitled entry");
  });

  it("ages a check in words", () => {
    expect(checkedLabel(null)).toBe("never checked");
    expect(checkedLabel(new Date(Date.now() - 4 * 60_000).toISOString())).toBe("checked 4 min ago");
  });
});
