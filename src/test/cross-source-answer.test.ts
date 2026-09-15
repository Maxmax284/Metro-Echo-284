import { describe, expect, it } from "vitest";
import { crossSourceReply, type AnchorRow } from "@/lib/crossSourceAnswer";

const anchors: AnchorRow[] = [
  {
    id: "e1",
    kind: "calendar",
    title: "ADHD appointment",
    at: "2026-09-17T14:00:00Z",
    location: "Riverside Clinic",
  },
];

describe("cross-source answer: conclusion first, sources behind it", () => {
  it("leads with one conclusion, not a per-source dump", () => {
    const { text, situation } = crossSourceReply({
      anchors,
      mail: [
        {
          id: "m1",
          subject: "Your ADHD appointment has moved — new address 240 Bergen Street",
          fromName: "Riverside Clinic",
          date: "2026-09-15T11:00:00Z",
          snippet: "We rescheduled you.",
        },
      ],
      files: [{ id: "f1", name: "ADHD appointment intake form.pdf", modifiedAt: "2026-09-14T09:00:00Z" }],
      fallback: "• nothing much",
    });
    expect(situation).toBeTruthy();
    expect(text.split("\n\n")[0]).toContain("ADHD appointment");
    expect(text).toContain("240 Bergen Street");
    expect(text).toContain("Where that comes from");
    expect(text).not.toBe("• nothing much");
  });

  it("says nothing on the calendar was changed by an email", () => {
    const { text } = crossSourceReply({
      anchors,
      mail: [
        {
          id: "m1",
          subject: "ADHD appointment rescheduled",
          fromName: "Clinic",
          date: "2026-09-15T11:00:00Z",
        },
      ],
      fallback: "x",
    });
    expect(text).toContain("Nothing on your calendar has been changed");
  });

  it("falls back to the plain list when nothing relates", () => {
    const { text, situation } = crossSourceReply({
      anchors,
      mail: [{ id: "m9", subject: "Your parcel shipped", fromName: "Shop", date: "2026-09-15T11:00:00Z" }],
      fallback: "• **Your parcel shipped** — Shop",
    });
    expect(situation).toBeNull();
    expect(text).toBe("• **Your parcel shipped** — Shop");
  });

  it("keeps unrelated results out of the conclusion but still shows them", () => {
    const { text } = crossSourceReply({
      anchors,
      mail: [
        { id: "m1", subject: "ADHD appointment rescheduled", fromName: "Clinic", date: "2026-09-15T11:00:00Z" },
        { id: "m9", subject: "Your parcel shipped", fromName: "Shop", date: "2026-09-15T12:00:00Z" },
      ],
      fallback: "x",
    });
    expect(text).toContain("Also turned up");
    expect(text).toContain("Your parcel shipped");
    expect(text.split("\n\n")[0]).not.toContain("parcel");
  });
});
