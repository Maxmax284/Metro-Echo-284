import { describe, expect, it } from "vitest";
import { eventWhere, humanizeEvent, trustNote } from "@/lib/plainLabels";

describe("humanizeEvent — watch, heads-up, journey, correction labels", () => {
  it("labels every watch lifecycle state in plain English", () => {
    expect(humanizeEvent("watch.created")).toBe("Echo started keeping an eye on this");
    expect(humanizeEvent("watch.checked")).toBe("Echo checked — nothing new");
    expect(humanizeEvent("watch.needs_you")).toBe("Something changed on a watch");
    expect(humanizeEvent("watch.done")).toBe("Watch finished — the answer is in");
    expect(humanizeEvent("watch.couldnt_finish")).toBe("Echo couldn't keep watching that");
    expect(humanizeEvent("watch.stopped")).toBe("Watch stopped");
    expect(humanizeEvent("watch.paused")).toBe("Watch paused");
  });

  it("labels heads-up delivery and failure honestly", () => {
    expect(humanizeEvent("nudge.delivered")).toBe("A heads-up reached your phone");
    expect(humanizeEvent("nudge.delivery_failed")).toBe("A heads-up couldn't reach your phone");
    expect(humanizeEvent("nudge.reached_messaging")).toBe("A heads-up went to Telegram");
    expect(humanizeEvent("nudge.reach_messaging_failed")).toBe("A heads-up couldn't reach Telegram");
  });

  it("labels journey notices as recorded events", () => {
    expect(humanizeEvent("journey.moved")).toBe("Your journey moved");
    expect(humanizeEvent("journey.notice_updated")).toBe("A journey heads-up was refreshed");
    expect(humanizeEvent("journey.before_you_leave")).toBe("Before-you-leave reminder noted");
    expect(humanizeEvent("journey.landed")).toBe("Touchdown noted");
  });

  it("labels briefing refreshes without claiming a rewrite", () => {
    expect(humanizeEvent("briefing.regenerated")).toBe("Briefing refreshed");
  });

  it("labels colon-format corrections and never leaks the raw verdict", () => {
    expect(humanizeEvent("correction:wrong")).toBe("You marked this wrong");
    expect(humanizeEvent("correction:useful")).toBe("You marked this useful");
    expect(humanizeEvent("correction:outdated")).toBe("You marked this outdated");
    expect(humanizeEvent("correction:source_bad")).toBe("You flagged a source");
    expect(humanizeEvent("correction:reject")).toBe("You hid this from Echo");
    expect(humanizeEvent("correction:continuity")).toBe("You corrected what Echo remembered");
    expect(humanizeEvent("correction:anything_new")).toBe("You corrected Echo");
  });

  it("keeps every label free of backend vocabulary", () => {
    const events = [
      "watch.created", "watch.checked", "watch.needs_you", "watch.done",
      "watch.couldnt_finish", "watch.stopped", "watch.paused",
      "nudge.delivered", "nudge.delivery_failed", "nudge.reached_messaging",
      "journey.moved", "journey.landed", "briefing.regenerated",
      "correction:wrong", "correction:useful",
    ];
    for (const e of events) {
      expect(humanizeEvent(e)).not.toMatch(/audit|entity|payload|nudge|_state\b/i);
    }
  });
});

describe("trustNote — new families", () => {
  it("explains watch, heads-up, journey and correction receipts", () => {
    expect(trustNote("watch.checked")).toMatch(/watch was checked or moved/);
    expect(trustNote("nudge.delivered")).toMatch(/reached — or missed — a surface/);
    expect(trustNote("journey.moved")).toMatch(/journey watch/);
    expect(trustNote("correction:wrong")).toMatch(/you corrected Echo/);
    expect(trustNote("briefing.regenerated")).toMatch(/earlier versions stay/);
  });
});

describe("eventWhere — new entity types land in a real room", () => {
  it("routes watches, flights and place briefings", () => {
    expect(eventWhere("watch").surface).toBe("today");
    expect(eventWhere("flight_plan").surface).toBe("schedule");
    expect(eventWhere("awareness_place").surface).toBe("awareness");
  });
});
