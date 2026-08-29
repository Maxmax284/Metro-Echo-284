import { describe, expect, it } from "vitest";
import { buildObjectLife, MAX_LIFE_STEPS, NO_LIFE_LINE } from "@/lib/objectLife";
import { confidenceBand, describeRead, inferredLine, readLine } from "@/lib/confidence";

const at = (n: number) => new Date(Date.parse("2026-08-01T00:00:00Z") + n * 3_600_000).toISOString();

describe("object life", () => {
  it("says nothing rather than inventing a history", () => {
    expect(buildObjectLife([]).line).toBe("");
    expect(NO_LIFE_LINE).toBe("No recorded history yet.");
  });

  it("tells the story from recorded events, oldest first", () => {
    const life = buildObjectLife(
      [
        { event: "note.linked", at: at(2), target: "Lamai rollout" },
        { event: "note.created", at: at(1), source: "telegram" },
      ],
      "due Fri",
    );
    expect(life.line).toBe("Captured from Telegram → filed to Lamai rollout → due Fri");
  });

  it("collapses repeats instead of listing them", () => {
    const life = buildObjectLife([
      { event: "commitment.created", at: at(1) },
      { event: "commitment.moved", at: at(2) },
      { event: "commitment.moved", at: at(3) },
      { event: "commitment.moved", at: at(4) },
    ]);
    expect(life.line).toBe("Created → moved 3 times");
  });

  it("truncates long lives and flags it", () => {
    const life = buildObjectLife([
      { event: "note.created", at: at(1), source: "email" },
      { event: "note.linked", at: at(2), target: "P" },
      { event: "note.updated", at: at(3) },
      { event: "note.reviewed", at: at(4) },
      { event: "note.completed", at: at(5) },
    ]);
    expect(life.truncated).toBe(true);
    expect(life.steps).toHaveLength(MAX_LIFE_STEPS);
    expect(life.steps[0].text).toBe("Captured from email");
  });

  it("collapses unknown events to a neutral word", () => {
    expect(buildObjectLife([{ event: "weird.thing", at: at(1) }]).line).toBe("recorded");
  });
});

describe("confidence", () => {
  it("bands coarsely and treats missing confidence as uncertain", () => {
    expect(confidenceBand(0.9)).toBe("certain");
    expect(confidenceBand(0.6)).toBe("likely");
    expect(confidenceBand(0.2)).toBe("uncertain");
    expect(confidenceBand(null)).toBe("uncertain");
  });

  it("makes a direct read look ordinary", () => {
    expect(readLine("calendar")).toBe("Read from calendar");
    const note = describeRead({ kind: "read", source: "telegram" });
    expect(note).toEqual({ kind: "read", band: "certain", text: "From Telegram", needsReview: false });
  });

  it("says an inference is an inference and asks for review when weak", () => {
    expect(inferredLine(0.6, "Lamai rollout")).toBe("Likely related to Lamai rollout");
    const weak = describeRead({ kind: "inferred", confidence: 0.2, about: "Lamai rollout" });
    expect(weak?.text).toBe("Uncertain — needs review");
    expect(weak?.needsReview).toBe(true);
  });

  it("returns nothing rather than faking a source", () => {
    expect(describeRead({ kind: "read", source: "some_connector" })).toBeNull();
  });
});
