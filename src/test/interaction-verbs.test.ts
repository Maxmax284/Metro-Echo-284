import { describe, expect, it } from "vitest";
import {
  INTERACTION_VERBS,
  RETIRED_VERBS,
  canonicalVerbFor,
  verbLabel,
  verbMeans,
} from "@/lib/interactionVerbs";

describe("interaction vocabulary", () => {
  it("has one label per meaning and no duplicate labels", () => {
    const labels = Object.values(INTERACTION_VERBS).map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never lists a canonical label as a retired synonym", () => {
    const labels = Object.values(INTERACTION_VERBS).map((v) => v.label.toLowerCase());
    for (const retired of RETIRED_VERBS) {
      expect(labels).not.toContain(retired.toLowerCase());
    }
  });

  it("maps the old words onto the verb that replaces them", () => {
    expect(canonicalVerbFor("Dismiss")).toBe("hide");
    expect(canonicalVerbFor("Remove")).toBe("hide");
    expect(canonicalVerbFor("Snooze")).toBe("later");
    expect(canonicalVerbFor("Ignore")).toBe("not_now");
    expect(canonicalVerbFor("Mark done")).toBe("handled");
  });

  it("treats an already-canonical label as needing no change", () => {
    expect(canonicalVerbFor("Hide")).toBeNull();
    expect(canonicalVerbFor("archive")).toBeNull();
  });

  it("only marks delete as irreversible", () => {
    const irreversible = Object.entries(INTERACTION_VERBS)
      .filter(([, v]) => !v.reversible)
      .map(([k]) => k);
    expect(irreversible).toEqual(["delete"]);
  });

  it("reads as plain English, no backend nouns", () => {
    for (const verb of Object.keys(INTERACTION_VERBS) as (keyof typeof INTERACTION_VERBS)[]) {
      const text = `${verbLabel(verb)} ${verbMeans(verb)}`.toLowerCase();
      for (const jargon of ["record set", "row", "entity", "payload", "status field", "table"]) {
        expect(text).not.toContain(jargon);
      }
    }
  });
});
