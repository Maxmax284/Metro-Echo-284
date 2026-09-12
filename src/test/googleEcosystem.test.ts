import { describe, expect, it } from "vitest";
import {
  GOOGLE_CAPABILITIES, accountLine, accountReach, addableCapabilities,
  capabilityReach, scopesFor, type GoogleAccountState,
} from "@/lib/googleEcosystem";
import { GOOGLE_CALENDAR_SCOPES } from "../../supabase/functions/_shared/appUserScopes";

const OUT: GoogleAccountState = { signedIn: false, account: null, granted: [] };
const CAL: GoogleAccountState = { signedIn: true, account: "max@example.com", granted: ["calendar"] };

describe("google as one account, several permissions", () => {
  it("never claims a service Echo has not built", () => {
    const wired = GOOGLE_CAPABILITIES.filter((c) => c.wired).map((c) => c.key);
    expect(wired).toEqual(["calendar"]);
    for (const cap of GOOGLE_CAPABILITIES.filter((c) => !c.wired)) {
      expect(cap.blocker).toBeTruthy();
    }
  });

  it("says signing in grants nothing on its own", () => {
    expect(accountLine(OUT)).toMatch(/gives Echo nothing/i);
    expect(accountReach(OUT)).toBe("available");
    expect(accountLine({ ...CAL, granted: [] })).toMatch(/no google service is switched on/i);
  });

  it("names only what is switched on", () => {
    expect(accountLine(CAL)).toMatch(/^Calendar is switched on/);
    expect(accountLine(CAL)).toMatch(/Nothing else in your Google account is readable/);
    expect(accountReach(CAL)).toBe("connected");
  });

  it("keeps unconnected services calm, not broken", () => {
    const gmail = GOOGLE_CAPABILITIES.find((c) => c.key === "gmail")!;
    expect(capabilityReach(gmail, CAL)).toBe("available");
    expect(capabilityReach(GOOGLE_CAPABILITIES[0], CAL)).toBe("connected");
  });

  it("flags a service that was working and stopped", () => {
    const failing: GoogleAccountState = { ...CAL, failing: ["calendar"] };
    expect(capabilityReach(GOOGLE_CAPABILITIES[0], failing)).toBe("needs_you");
    expect(accountReach(failing)).toBe("needs_you");
  });

  it("offers nothing extra to add until wiring exists", () => {
    expect(addableCapabilities(CAL)).toEqual([]);
    expect(addableCapabilities(OUT).map((c) => c.key)).toEqual(["calendar"]);
  });

  it("asks for exactly the calendar permissions already in use", () => {
    for (const scope of scopesFor(["calendar"])) {
      expect(GOOGLE_CALENDAR_SCOPES).toContain(scope);
    }
  });

  it("keeps calendar as the only service that may act", () => {
    for (const cap of GOOGLE_CAPABILITIES) {
      if (cap.key !== "calendar") expect(cap.authority).not.toBe("act");
    }
  });
});
