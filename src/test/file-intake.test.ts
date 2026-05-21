// Validation rules for Phase 2 file intake.
import { describe, expect, it } from "vitest";
import {
  validateFileIntakeUpdate,
  canTransitionReview,
  assertTransitionReview,
  isSensitiveByType,
} from "@/lib/fileIntake";

describe("file intake validation", () => {
  it("accepts a clean patch", () => {
    const out = validateFileIntakeUpdate({
      detected_doc_type: "receipt",
      confidence: "high",
      review_status: "suggested",
      sensitive: false,
      extracted_entities: { amounts: [{ value: 12.5, currency: "USD" }] },
      suggested_actions: [{ kind: "create_reminder", label: "Remind me to file this" }],
    });
    expect(out.detected_doc_type).toBe("receipt");
    expect(out.suggested_actions?.[0].confidence).toBe("medium"); // default applied
  });

  it("rejects unknown enum values", () => {
    expect(() => validateFileIntakeUpdate({ detected_doc_type: "tax_return" })).toThrow();
    expect(() => validateFileIntakeUpdate({ confidence: "very-high" })).toThrow();
    expect(() => validateFileIntakeUpdate({ review_status: "done" })).toThrow();
  });

  it("rejects unknown top-level fields (strict)", () => {
    expect(() => validateFileIntakeUpdate({ rogue_field: true })).toThrow();
  });

  it("rejects unknown suggested-action kinds", () => {
    expect(() =>
      validateFileIntakeUpdate({
        suggested_actions: [{ kind: "auto_execute_payment", label: "x" }],
      }),
    ).toThrow();
  });

  it("rejects extracted_text over the size cap", () => {
    expect(() =>
      validateFileIntakeUpdate({ extracted_text: "x".repeat(200_001) }),
    ).toThrow();
  });
});

describe("sensitive-by-type", () => {
  it("flags identity / financial / medical types", () => {
    expect(isSensitiveByType("id_doc")).toBe(true);
    expect(isSensitiveByType("medical")).toBe(true);
    expect(isSensitiveByType("invoice")).toBe(true);
    expect(isSensitiveByType("payment_proof")).toBe(true);
  });
  it("leaves benign types alone", () => {
    expect(isSensitiveByType("receipt")).toBe(false);
    expect(isSensitiveByType("screenshot")).toBe(false);
    expect(isSensitiveByType("unknown")).toBe(false);
    expect(isSensitiveByType(null)).toBe(false);
  });
});

describe("review-status transitions", () => {
  it("allows the inbox-style forward moves", () => {
    expect(canTransitionReview("new", "suggested")).toBe(true);
    expect(canTransitionReview("suggested", "routed")).toBe(true);
    expect(canTransitionReview("routed", "attached")).toBe(true);
    expect(canTransitionReview("waiting", "stale")).toBe(true);
  });

  it("allows restoring archived / ignored back to review", () => {
    expect(canTransitionReview("archived", "needs_review")).toBe(true);
    expect(canTransitionReview("ignored", "needs_review")).toBe(true);
  });

  it("blocks nonsense jumps", () => {
    expect(canTransitionReview("archived", "routed")).toBe(false);
    expect(canTransitionReview("attached", "new")).toBe(false);
    expect(() => assertTransitionReview("archived", "routed")).toThrow();
  });

  it("treats same-state as a no-op", () => {
    expect(canTransitionReview("new", "new")).toBe(true);
  });
});
