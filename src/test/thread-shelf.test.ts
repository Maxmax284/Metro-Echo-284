// The rail's judgements, tested rather than eyeballed.
import { describe, it, expect } from "vitest";
import {
  coldOffer, dayBucket, edgeSwipeOpens, groupByDay, isUnread, threadInitials, unreadCount,
} from "@/lib/threadShelf";
import type { AskThread } from "@/lib/askThreads";

const NOW = new Date("2026-09-15T20:00:00Z").getTime();

function thread(over: Partial<AskThread> = {}): AskThread {
  return {
    id: "t1", title: "Wingate stay", scope: "personal", organization_id: null,
    pinned: false, archived_at: null, deleted_at: null, auto_titled: true,
    context_kind: null, context_id: null, context_label: null,
    last_message_at: "2026-09-15T19:00:00Z",
    created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-15T19:00:00Z",
    ...over,
  };
}

describe("unread marks", () => {
  it("marks a thread that moved after this device last read it", () => {
    expect(isUnread(thread(), { t1: "2026-09-15T18:00:00Z" })).toBe(true);
  });

  it("stays quiet when the device already read past the movement", () => {
    expect(isUnread(thread(), { t1: "2026-09-15T19:30:00Z" })).toBe(false);
  });

  it("never shouts about a thread that has never moved", () => {
    expect(isUnread(thread({ last_message_at: null }), {})).toBe(false);
  });

  it("counts only the threads that moved", () => {
    const list = [thread(), thread({ id: "t2", last_message_at: null })];
    expect(unreadCount(list, {})).toBe(1);
  });
});

describe("day shelves", () => {
  it("labels the person's own days", () => {
    expect(dayBucket(new Date(NOW - 60_000).toISOString(), NOW)).toBe("Today");
    expect(dayBucket(new Date(NOW - 26 * 3600_000).toISOString(), NOW)).toBe("Yesterday");
    expect(dayBucket(new Date(NOW - 4 * 86400_000).toISOString(), NOW)).toBe("Earlier this week");
    expect(dayBucket(new Date(NOW - 40 * 86400_000).toISOString(), NOW)).toBe("Older");
  });

  it("keeps shelves in time order and never renders an empty one", () => {
    const groups = groupByDay(
      [
        thread({ id: "old", last_message_at: new Date(NOW - 40 * 86400_000).toISOString() }),
        thread({ id: "now", last_message_at: new Date(NOW - 60_000).toISOString() }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Older"]);
    expect(groups.every((g) => g.threads.length > 0)).toBe(true);
  });
});

describe("pinned initials", () => {
  it("uses the first letters of the first two words", () => {
    expect(threadInitials(thread({ title: "Wingate stay" }))).toBe("WS");
  });

  it("falls back to two characters of a single word", () => {
    expect(threadInitials(thread({ title: "Dani" }))).toBe("DA");
  });

  it("never renders nothing", () => {
    expect(threadInitials(thread({ title: "!!!" }))).toBe("··");
  });
});

describe("continue or start fresh", () => {
  it("says nothing while a situation is still warm", () => {
    expect(coldOffer(new Date(NOW - 3600_000).toISOString(), NOW)).toBeNull();
  });

  it("reports how long a cold situation has been quiet", () => {
    expect(coldOffer(new Date(NOW - 8 * 3600_000).toISOString(), NOW)).toEqual({ quietFor: "8 hours" });
    expect(coldOffer(new Date(NOW - 3 * 86400_000).toISOString(), NOW)).toEqual({ quietFor: "3 days" });
  });

  it("says nothing about a thread with no recorded activity", () => {
    expect(coldOffer(null, NOW)).toBeNull();
  });
});

describe("edge swipe", () => {
  it("opens on a deliberate pull from the edge", () => {
    expect(edgeSwipeOpens({ startX: 6, dx: 90, dy: 10 })).toBe(true);
  });

  it("ignores a swipe that started away from the edge", () => {
    expect(edgeSwipeOpens({ startX: 200, dx: 90, dy: 10 })).toBe(false);
  });

  it("ignores a short pull and a mostly vertical drag", () => {
    expect(edgeSwipeOpens({ startX: 4, dx: 20, dy: 4 })).toBe(false);
    expect(edgeSwipeOpens({ startX: 4, dx: 90, dy: 120 })).toBe(false);
  });
});
