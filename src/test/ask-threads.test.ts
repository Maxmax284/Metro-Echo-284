import { describe, expect, it } from "vitest";
import {
  autoTitle, bumpOutput, isFiller, outputChips, outputSummary, relTime, sortThreads,
  threadMatchesScope, type AskThread,
} from "@/lib/askThreads";

const base: AskThread = {
  id: "1", title: null, scope: "personal", organization_id: null, pinned: false,
  archived_at: null, deleted_at: null, auto_titled: true, context_kind: null,
  context_id: null, context_label: null, last_message_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

describe("ask thread titles", () => {
  it("ignores filler", () => {
    expect(isFiller("hey")).toBe(true);
    expect(autoTitle("thanks")).toBeNull();
    expect(autoTitle("  ")).toBeNull();
  });

  it("strips lead-ins and keeps the intent", () => {
    expect(autoTitle("can you check the Lamai booking numbers?")).toBe("Check the Lamai booking numbers");
    expect(autoTitle("hey so I need the invoice from Nikki")).toBe("The invoice from Nikki");
  });

  it("trims long asks", () => {
    const t = autoTitle("summarize every single thing that happened across all of the camps last week")!;
    expect(t.endsWith("…")).toBe(true);
    expect(t.split(" ").length).toBeLessThanOrEqual(9);
  });
});

describe("scope isolation", () => {
  it("keeps workspace threads out of personal", () => {
    const org: AskThread = { ...base, scope: "organization", organization_id: "org-1" };
    expect(threadMatchesScope(org, { type: "personal", organizationId: null })).toBe(false);
    expect(threadMatchesScope(org, { type: "organization", organizationId: "org-1" })).toBe(true);
    expect(threadMatchesScope(org, { type: "organization", organizationId: "org-2" })).toBe(false);
    expect(threadMatchesScope(base, { type: "personal", organizationId: null })).toBe(true);
  });
});

describe("ordering", () => {
  it("pins first, then most recent", () => {
    const list: AskThread[] = [
      { ...base, id: "a", last_message_at: "2026-01-03T00:00:00Z" },
      { ...base, id: "b", last_message_at: "2026-01-05T00:00:00Z" },
      { ...base, id: "c", pinned: true, last_message_at: "2026-01-01T00:00:00Z" },
    ];
    expect(sortThreads(list).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});

describe("plain time", () => {
  it("speaks in human units", () => {
    const now = new Date("2026-01-10T12:00:00Z").getTime();
    expect(relTime("2026-01-10T11:59:40Z", now)).toBe("just now");
    expect(relTime("2026-01-10T09:00:00Z", now)).toBe("3h ago");
    expect(relTime("2026-01-09T09:00:00Z", now)).toBe("yesterday");
    expect(relTime(null, now)).toBe("");
  });
});

describe("thread outputs", () => {
  it("summarizes aftermath with plural forms", () => {
    expect(outputChips({ draft: 2, note: 1 })).toEqual(["2 drafts", "1 note"]);
    expect(outputSummary({ draft: 2, note: 1 })).toBe("2 drafts · 1 note");
  });

  it("stays quiet when a thread produced nothing", () => {
    expect(outputSummary(null)).toBeNull();
    expect(outputSummary({ draft: 0 })).toBeNull();
  });

  it("bumps one counter without losing the others", () => {
    expect(bumpOutput({ draft: 1, note: 2 }, "draft")).toEqual({ draft: 2, note: 2 });
    expect(bumpOutput(undefined, "commitment")).toEqual({ commitment: 1 });
  });
});
