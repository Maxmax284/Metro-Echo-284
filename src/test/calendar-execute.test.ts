import { describe, expect, it } from "vitest";
import { providerEventIdFromUid } from "@/lib/calendarProposal";

describe("provider event id mapping", () => {
  it("strips the @google.com suffix from iCal UIDs", () => {
    expect(providerEventIdFromUid("abc123@google.com")).toBe("abc123");
    expect(providerEventIdFromUid("ABC123@GOOGLE.COM")).toBe("ABC123");
  });

  it("leaves non-google UIDs alone", () => {
    expect(providerEventIdFromUid("ical-uid-7")).toBe("ical-uid-7");
  });

  it("handles null", () => {
    expect(providerEventIdFromUid(null)).toBeNull();
  });
});
