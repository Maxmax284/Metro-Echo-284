import { describe, it, expect } from "vitest";
import { readsAsApproval, readsAsRejection } from "../../supabase/functions/_shared/calendarSettleWords.ts";

describe("typed approval words", () => {
  it("reads short affirmatives as approval", () => {
    for (const t of ["yes", "Yes.", "yep", "do it", "go ahead", "approve", "confirm"]) {
      expect(readsAsApproval(t)).toBe(true);
    }
  });

  it("reads short negatives as rejection", () => {
    for (const t of ["no", "Nope", "cancel", "never mind", "drop it"]) {
      expect(readsAsRejection(t)).toBe(true);
    }
  });

  it("leaves real sentences to the conversation", () => {
    for (const t of ["yes but move it to 7", "ok so what's on Tuesday?", "yeah man I want this on my calendar too"]) {
      expect(readsAsApproval(t)).toBe(false);
      expect(readsAsRejection(t)).toBe(false);
    }
  });
});
