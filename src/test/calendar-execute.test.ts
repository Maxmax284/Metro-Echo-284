import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { calendarWriteState } from "@/lib/calendarWrite";
import { providerEventIdFromUid } from "@/lib/calendarProposal";
import { supabase } from "@/integrations/supabase/client";

describe("calendar write state (client)", () => {
  const invoke = vi.spyOn(supabase.functions, "invoke");

  beforeEach(() => invoke.mockReset());
  afterEach(() => invoke.mockRestore());

  it("reports connected when the backend says the connector is linked", async () => {
    invoke.mockResolvedValue({ data: { write_state: "connected" }, error: null } as any);
    expect(await calendarWriteState()).toBe("connected");
    expect(invoke).toHaveBeenCalledWith("calendar-write-status", {});
  });

  it("fails closed to read_only on error", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("nope") } as any);
    expect(await calendarWriteState()).toBe("read_only");
  });
});

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
