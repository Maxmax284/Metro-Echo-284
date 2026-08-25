import { describe, it, expect } from "vitest";
import {
  backoffSecondsFor,
  buildBridgeBody,
  isTerminalAttempt,
  shouldRetryStatus,
} from "../../supabase/functions/_shared/outboundBridge";

describe("outbound bridge retry rules", () => {
  it("backs off further with each attempt and then holds", () => {
    expect(backoffSecondsFor(0)).toBe(30);
    expect(backoffSecondsFor(1)).toBe(120);
    expect(backoffSecondsFor(3)).toBe(1800);
    expect(backoffSecondsFor(99)).toBe(21600);
  });

  it("retries transport failures, rate limits and hub outages", () => {
    expect(shouldRetryStatus(null)).toBe(true);
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(502)).toBe(true);
  });

  it("never retries a hub that said no", () => {
    expect(shouldRetryStatus(400)).toBe(false);
    expect(shouldRetryStatus(401)).toBe(false);
    expect(shouldRetryStatus(404)).toBe(false);
  });

  it("gives up after six attempts", () => {
    expect(isTerminalAttempt(5)).toBe(false);
    expect(isTerminalAttempt(6)).toBe(true);
  });
});

describe("bridge body", () => {
  const body = buildBridgeBody(
    {
      ownerId: "u1",
      eventType: "awareness.nudge.stale_commitment",
      title: "Still open past due",
      lines: ["Due 5 days ago."],
      urgency: "high",
      idempotencyKey: "nudge:u1:k1",
    },
    "ground_truth_hub",
  ) as any;

  it("carries the notice and the idempotency key", () => {
    expect(body.source_platform).toBe("vanta");
    expect(body.target_platform).toBe("ground_truth_hub");
    expect(body.idempotency_key).toBe("nudge:u1:k1");
    expect(body.notice.urgency).toBe("high");
    expect(body.notice.lines).toEqual(["Due 5 days ago."]);
  });

  it("tells the hub plainly that nothing may be executed", () => {
    expect(body.execution.allowed).toBe(false);
  });
});
