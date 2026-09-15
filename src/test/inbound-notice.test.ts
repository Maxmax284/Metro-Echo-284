import { describe, expect, it } from "vitest";
import {
  INBOUND_NOTICE_KIND,
  noticeBody,
  noticeDedupeKey,
  noticePriority,
  noticeTitle,
  shouldRaiseNotice,
} from "../../supabase/functions/_shared/awareness/inboundNotice";
import { DRIFT_KINDS, isDriftKind } from "@/lib/drift";

describe("inbound notice", () => {
  it("only speaks when messaging would have spoken", () => {
    expect(shouldRaiseNotice("background")).toBe(false);
    expect(shouldRaiseNotice("useful")).toBe(false);
    expect(shouldRaiseNotice("attention")).toBe(false);
    expect(shouldRaiseNotice("time_sensitive")).toBe(true);
    expect(shouldRaiseNotice("critical")).toBe(true);
  });

  it("weights critical above everything ordinary", () => {
    expect(noticePriority("critical")).toBeGreaterThan(noticePriority("time_sensitive"));
  });

  it("uses the sender's idempotency key as identity, so a retry cannot stack", () => {
    expect(noticeDedupeKey("abc-123")).toBe(noticeDedupeKey("abc-123"));
    expect(noticeDedupeKey("abc-123")).not.toBe(noticeDedupeKey("abc-124"));
  });

  it("says what arrived, where it is, and that nothing was actioned", () => {
    const body = noticeBody(
      { title: "A payment failed", lines: ["Booking 4471.", "$240."] },
      { displayName: "LMT Camp State", alsoSentToMessaging: true },
    );
    expect(body).toContain("From LMT Camp State.");
    expect(body).toContain("Booking 4471.");
    expect(body).toContain("Nothing was actioned.");
    expect(body).toContain("Also sent to Telegram.");
  });

  it("never invents facts the payload did not carry", () => {
    const body = noticeBody({ title: "A guest asked for something", lines: [] }, { displayName: "CampCore" });
    expect(body).toBe("From CampCore. It is in your inbox for review. Nothing was actioned.");
  });

  it("keeps the platform's own headline, trimmed", () => {
    expect(noticeTitle({ title: "x".repeat(400), lines: [] }).length).toBe(200);
  });

  it("renders in Today's noticed lane", () => {
    expect(isDriftKind(INBOUND_NOTICE_KIND)).toBe(true);
    expect(DRIFT_KINDS).toContain(INBOUND_NOTICE_KIND);
  });
});
