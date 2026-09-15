import { describe, expect, it } from "vitest";
import {
  GOOGLE_CAPABILITIES, accountLine, accountReach, capabilityReach, googleStateFrom,
  isGranted, isSharedGrant, sharedGrantLine,
} from "@/lib/googleEcosystem";
import type { GoogleServiceStatus } from "@/lib/googleServices";
import { googleServiceStatuses } from "../../supabase/functions/_shared/googleHealth";

const cap = (key: string) => GOOGLE_CAPABILITIES.find((c) => c.key === key)!;

const svc = (
  over: Partial<GoogleServiceStatus> & { service: GoogleServiceStatus["service"] },
): GoogleServiceStatus => ({
  connected: false,
  working: false,
  via: null,
  offerable: true,
  account: null,
  failing: false,
  detail: null,
  ...over,
});

describe("a calendar that already reads through the app's own link", () => {
  it("reports working, via app, when a feed is active without a personal grant", () => {
    const [calendar] = googleServiceStatuses({
      rows: [],
      offerable: () => true,
      calendarFeedActive: true,
    });
    expect(calendar.service).toBe("google_calendar");
    expect(calendar.connected).toBe(false);
    expect(calendar.working).toBe(true);
    expect(calendar.via).toBe("app");
  });

  it("stays available when no feed reads at all", () => {
    const [calendar] = googleServiceStatuses({ rows: [], offerable: () => true });
    expect(calendar.working).toBe(false);
    expect(calendar.via).toBe(null);
  });

  it("never lends the shared link to mail or files", () => {
    const all = googleServiceStatuses({ rows: [], offerable: () => true, calendarFeedActive: true });
    for (const s of all.filter((s) => s.service !== "google_calendar")) {
      expect(s.working).toBe(false);
      expect(s.via).toBe(null);
    }
  });

  it("says connected on the card and explains whose grant it is", () => {
    const state = googleStateFrom({
      signedIn: true,
      account: "max@example.com",
      services: [
        svc({ service: "google_calendar", working: true, via: "app" }),
        svc({ service: "google_mail", connected: true, working: true, via: "you" }),
        svc({ service: "google_drive" }),
      ],
    });
    expect(capabilityReach(cap("calendar"), state)).toBe("connected");
    expect(accountReach(state)).toBe("connected");
    expect(isSharedGrant(cap("calendar"), state)).toBe(true);
    expect(isGranted(cap("calendar"), state)).toBe(false);
    expect(sharedGrantLine(cap("calendar"), state)).toContain("already reads your calendar");
    expect(sharedGrantLine(cap("mail" in state ? "gmail" : "gmail"), state)).toBe(null);
    expect(accountLine(state)).toContain("Calendar");
  });
});
