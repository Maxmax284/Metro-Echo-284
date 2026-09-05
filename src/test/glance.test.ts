import { describe, expect, it } from "vitest";
import { pickGlance, wristActionsFor, isWristSafe, looksLikeCommitment, SILENCE_LINE, type GlanceItem } from "@/lib/glance";
import { renderForms } from "@/lib/deviceCompression";
import { hapticFor, allowHaptic } from "@/lib/haptics";
import { urgencyForNudge } from "@/hooks/useGlance";

const item = (over: Partial<GlanceItem> = {}): GlanceItem => ({
  id: over.id ?? "1",
  kind: over.kind ?? "commitment_overdue",
  title: over.title ?? "Send Nikki the schedule",
  urgency: over.urgency ?? "time_sensitive",
  createdAt: over.createdAt ?? new Date().toISOString(),
  ...over,
});

describe("wrist threshold", () => {
  it("stays silent when nothing clears the bar", () => {
    const d = pickGlance({ items: [item({ urgency: "useful" })] });
    expect(d.card).toBeNull();
    expect(d.held).toBe(1);
    expect(SILENCE_LINE).toBe("Nothing needs you.");
  });

  it("holds a merely meaningful change during quiet hours", () => {
    const d = pickGlance({ items: [item({ urgency: "attention" })], quietHours: true });
    expect(d.card).toBeNull();
  });

  it("still shows a critical card during quiet hours", () => {
    const d = pickGlance({ items: [item({ urgency: "critical" })], quietHours: true });
    expect(d.card?.id).toBe("1");
  });

  it("shows one card only, and counts the rest as held", () => {
    const d = pickGlance({
      items: [item({ id: "a" }), item({ id: "b" }), item({ id: "c", urgency: "useful" })],
    });
    expect(d.card).not.toBeNull();
    expect(d.held).toBe(2);
  });

  it("does not repeat a card it just surfaced", () => {
    const d = pickGlance({ items: [item({ lastSurfacedAt: new Date().toISOString() })] });
    expect(d.card).toBeNull();
  });
});

describe("wrist actions", () => {
  it("never offers an approval verb", () => {
    for (const a of wristActionsFor(item())) expect(a).not.toMatch(/approve|execute|run/);
    expect(isWristSafe("approve")).toBe(false);
    expect(isWristSafe("noted")).toBe(true);
  });

  it("offers Mark done only for a promise", () => {
    expect(wristActionsFor(item({ entity: { type: "commitment", id: "x" } }))).toContain("done");
    expect(wristActionsFor(item({ kind: "note_unrouted", entity: { type: "note", id: "x" } }))).not.toContain("done");
  });
});

describe("compression", () => {
  it("keeps the wrist form shortest and never contradicts the desk", () => {
    const f = renderForms({ title: "Nikki's schedule is still unsent", lines: ["Due 6pm"] }, "time_sensitive");
    expect(f.wrist.length).toBeLessThanOrEqual(f.desk.length);
    expect(f.wrist.length).toBeGreaterThan(0);
  });
});

describe("haptics", () => {
  it("holds ordinary buzzes in quiet hours but lets critical through", () => {
    expect(allowHaptic(hapticFor("attention"), { quietHours: true })).toBe(false);
    expect(allowHaptic(hapticFor("critical"), { quietHours: true })).toBe(true);
  });
});

describe("nudge urgency", () => {
  it("never lets a score alone claim critical", () => {
    expect(urgencyForNudge({ kind: "whatever", priority: 99 })).toBe("time_sensitive");
    expect(urgencyForNudge({ kind: "whatever", priority: 0 })).toBe("useful");
  });
});

describe("capture", () => {
  it("spots a promise in plain speech without turning it into one", () => {
    expect(looksLikeCommitment("Remind me to send Nikki the schedule")).toBe(true);
    expect(looksLikeCommitment("cold today")).toBe(false);
  });
});
