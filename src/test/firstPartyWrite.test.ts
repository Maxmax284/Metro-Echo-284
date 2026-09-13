// A write only counts when the other side proves it happened.
import { describe, expect, it } from "vitest";
import {
  buildWriteBody,
  isWriteOperation,
  readConfirmation,
  resolveWriteTarget,
  WriteNotConfirmed,
} from "../../supabase/functions/_shared/firstPartyWrite";

describe("first-party write contract", () => {
  it("only allows the operations Echo is permitted to ask for", () => {
    expect(isWriteOperation("booking.cancel")).toBe(true);
    expect(isWriteOperation("database.drop")).toBe(false);
    expect(isWriteOperation(undefined)).toBe(false);
  });

  it("treats an unwired provider as not connected, not broken", () => {
    expect(resolveWriteTarget("ground_truth_hub")).toBeNull();
    expect(resolveWriteTarget("nobody")).toBeNull();
  });

  it("sends a signed, idempotent, approval-stamped body", () => {
    const body = buildWriteBody(
      {
        provider: "ground_truth_hub",
        operation: "booking.update",
        subjectId: "bk_1",
        fields: { checkout: "2026-09-20" },
        idempotencyKey: "action:abc",
        actionId: "abc",
      },
      "1789",
    );
    expect(body).toMatchObject({
      version: 1,
      source: "metro_echo",
      operation: "booking.update",
      subject_id: "bk_1",
      idempotency_key: "action:abc",
      approved: true,
    });
  });

  it("accepts a real confirmation", () => {
    const c = readConfirmation("ground_truth_hub", "booking.update", 200, {
      ok: true,
      id: "rec_9",
      state: "extended",
      confirmed_at: "2026-09-13T12:40:00Z",
    });
    expect(c.id).toBe("rec_9");
    expect(c.state).toBe("extended");
  });

  it("refuses a vague 200, an id-less confirmation and any error status", () => {
    expect(() => readConfirmation("ground_truth_hub", "booking.update", 200, {})).toThrow(WriteNotConfirmed);
    expect(() => readConfirmation("ground_truth_hub", "booking.update", 200, { ok: true })).toThrow(WriteNotConfirmed);
    expect(() =>
      readConfirmation("ground_truth_hub", "booking.cancel", 409, { error: "already cancelled" }),
    ).toThrow("already cancelled");
  });
});
