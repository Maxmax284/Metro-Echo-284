import { describe, expect, it } from "vitest";

// Mirrors supabase/functions/_shared/telegramReplies.ts + workReads.ts formatting
// rules. Kept as a plain contract test: the button vocabulary is fixed and the
// read-only answers must stay short and truthful.
import { formatChanged, formatDue, formatWaiting } from "../../supabase/functions/_shared/workReads";
import { SNOOZE_PRESETS, vantaLink } from "../../supabase/functions/_shared/telegramReplies";

describe("telegram deep links", () => {
  it("points a commitment at its own focus param", () => {
    expect(vantaLink("commitments", { base: "https://x.app", commitmentId: "c1" })).toBe(
      "https://x.app/?commitment=c1",
    );
  });

  it("falls back to a surface link", () => {
    expect(vantaLink("inbox", { base: "https://x.app" })).toBe("https://x.app/?surface=inbox");
  });

  it("returns null without a public base", () => {
    expect(vantaLink("today", { base: "" })).toBeNull();
  });

  it("offers exactly three snooze presets", () => {
    expect(SNOOZE_PRESETS.map((p) => p.minutes)).toEqual([60, 180, 1440]);
  });
});

describe("read-only work answers", () => {
  it("says nothing is waiting when nothing is", () => {
    expect(
      formatWaiting({ stagedActions: 0, filesNeedingReview: 0, overdueCommitments: 0, overdueTop: null }),
    ).toContain("Nothing's waiting");
  });

  it("names the top overdue promise", () => {
    const out = formatWaiting({ stagedActions: 2, filesNeedingReview: 1, overdueCommitments: 1, overdueTop: "Send Nikki the invoice" });
    expect(out).toContain("2 drafts waiting");
    expect(out).toContain("Send Nikki the invoice");
  });

  it("caps due lists at five lines", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ summary: `p${i}`, due_at: "2026-01-01T10:00:00Z", overdue: false }));
    const out = formatDue(items, 7, "UTC");
    expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBe(5);
    expect(out).toContain("(+3 more)");
  });

  it("reports a diff, never a bare status", () => {
    expect(formatChanged({ captures: 0, commitmentsClosed: 0, drafts: 0, findings: 0 }, 7)).toContain("Quiet");
    expect(formatChanged({ captures: 2, commitmentsClosed: 1, drafts: 0, findings: 0 }, 7)).toContain("2 things came in");
  });
});
