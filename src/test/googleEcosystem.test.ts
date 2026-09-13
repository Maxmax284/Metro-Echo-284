import { describe, expect, it } from "vitest";
import {
  GOOGLE_CAPABILITIES, accountLine, accountReach, addableCapabilities,
  capabilityReach, googleStateFrom, notOfferableLine, type GoogleAccountState,
} from "@/lib/googleEcosystem";
import type { GoogleServiceStatus } from "@/lib/googleServices";
import {
  GOOGLE_MAIL_SEND_SCOPE, scopesForConnector,
} from "../../supabase/functions/_shared/appUserScopes";

const svc = (over: Partial<GoogleServiceStatus> & { service: GoogleServiceStatus["service"] }): GoogleServiceStatus => ({
  connected: false,
  offerable: true,
  account: null,
  failing: false,
  detail: null,
  ...over,
});

const OUT: GoogleAccountState = googleStateFrom({
  signedIn: false,
  account: null,
  services: [svc({ service: "google_calendar" }), svc({ service: "google_mail" }), svc({ service: "google_drive" })],
});

const CAL: GoogleAccountState = googleStateFrom({
  signedIn: true,
  account: "max@example.com",
  services: [
    svc({ service: "google_calendar", connected: true, account: "max@example.com" }),
    svc({ service: "google_mail" }),
    svc({ service: "google_drive" }),
  ],
});

describe("google as one account, several permissions", () => {
  it("never claims a service Echo has not built", () => {
    const wired = GOOGLE_CAPABILITIES.filter((c) => c.wired).map((c) => c.key);
    expect(wired).toEqual(["calendar", "gmail", "drive"]);
    for (const cap of GOOGLE_CAPABILITIES.filter((c) => !c.wired)) {
      expect(cap.blocker).toBeTruthy();
    }
  });

  it("has dropped Contacts rather than showing a button that cannot work", () => {
    expect(GOOGLE_CAPABILITIES.map((c) => c.key)).not.toContain("contacts");
  });

  it("says signing in grants nothing on its own", () => {
    expect(accountLine(OUT)).toMatch(/gives Echo nothing/i);
    expect(accountReach(OUT)).toBe("available");
  });

  it("never borrows the workspace connection to claim you are connected", () => {
    /* signed_in true with no granted service is still Available on the glass. */
    const borrowed = googleStateFrom({
      signedIn: true,
      account: "builder@example.com",
      services: [svc({ service: "google_calendar" })],
    });
    expect(accountReach(borrowed)).toBe("available");
    expect(capabilityReach(GOOGLE_CAPABILITIES[0], borrowed)).toBe("available");
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
    const failing = googleStateFrom({
      signedIn: true,
      account: "max@example.com",
      services: [svc({ service: "google_calendar", connected: true, failing: true })],
    });
    expect(capabilityReach(GOOGLE_CAPABILITIES[0], failing)).toBe("needs_you");
    expect(accountReach(failing)).toBe("needs_you");
  });

  it("offers the built services that are not on yet", () => {
    expect(addableCapabilities(CAL).map((c) => c.key)).toEqual(["gmail", "drive"]);
    expect(addableCapabilities(OUT).map((c) => c.key)).toEqual(["calendar", "gmail", "drive"]);
  });

  it("explains a built service the app has not been allowed to offer", () => {
    const notAllowed = googleStateFrom({
      signedIn: false,
      account: null,
      services: [svc({ service: "google_mail", offerable: false })],
    });
    const gmail = GOOGLE_CAPABILITIES.find((c) => c.key === "gmail")!;
    expect(addableCapabilities(notAllowed).map((c) => c.key)).not.toContain("gmail");
    expect(notOfferableLine(gmail, notAllowed)).toMatch(/an owner has to allow it/i);
  });

  it("never asks for permission to send mail while only reading it", () => {
    expect(scopesForConnector("google_mail")).not.toContain(GOOGLE_MAIL_SEND_SCOPE);
    expect(scopesForConnector("google_mail", { withSend: true })).toContain(GOOGLE_MAIL_SEND_SCOPE);
  });

  it("keeps each consent to one service plus who you are", () => {
    for (const id of ["google_calendar", "google_mail", "google_drive"] as const) {
      const scopes = scopesForConnector(id);
      const product = id.replace("google_", "").replace("mail", "gmail");
      expect(scopes.some((s) => s.includes(product))).toBe(true);
      for (const other of ["calendar", "gmail", "drive"].filter((p) => p !== product)) {
        expect(scopes.some((s) => s.includes(`/auth/${other}`))).toBe(false);
      }
    }
  });

  it("keeps Drive to reading only", () => {
    const drive = GOOGLE_CAPABILITIES.find((c) => c.key === "drive")!;
    expect(drive.authority).toBe("see");
    expect(scopesForConnector("google_drive").every((s) => !s.endsWith("/drive"))).toBe(true);
  });
});
