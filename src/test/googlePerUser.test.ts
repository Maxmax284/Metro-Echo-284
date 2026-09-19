// Per-user Google: one account container, one grant per service, and a problem
// that stays with the service that had it.
import { describe, expect, it } from "vitest";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_MAIL_SEND_SCOPE,
  scopesForConnector,
} from "../../supabase/functions/_shared/appUserScopes";
import {
  googleServiceStatuses,
  type ConnectionRow,
} from "../../supabase/functions/_shared/googleHealth";
import {
  accountLine,
  accountReach,
  capabilityReach,
  googleStateFrom,
  GOOGLE_CAPABILITIES,
} from "../lib/googleEcosystem";
import { mailSearchQuery, mailAnswer } from "../../supabase/functions/_shared/mailRead";

const row = (over: Partial<ConnectionRow> & { connector_id: string }): ConnectionRow => ({
  account_label: "max@example.com",
  last_error: null,
  ...over,
});

const statuses = (rows: ConnectionRow[], calendarSyncError: string | null = null) =>
  googleServiceStatuses({ rows, offerable: () => true, calendarSyncError });

const find = (rows: ConnectionRow[], service: string) =>
  statuses(rows).find((s) => s.service === service)!;

describe("scopes asked for per service", () => {
  it("always asks who you are, and nothing beyond the one service", () => {
    for (const id of ["google_calendar", "google_mail", "google_drive"] as const) {
      const scopes = scopesForConnector(id);
      for (const identity of GOOGLE_IDENTITY_SCOPES) expect(scopes).toContain(identity);
      expect(scopes).not.toContain(GOOGLE_MAIL_SEND_SCOPE);
    }
  });

  it("mail is read and prepare only until a send is actually attempted", () => {
    const read = scopesForConnector("google_mail");
    expect(read).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(read).toContain("https://www.googleapis.com/auth/gmail.compose");
    expect(read).not.toContain(GOOGLE_MAIL_SEND_SCOPE);
    expect(scopesForConnector("google_mail", { withSend: true })).toContain(GOOGLE_MAIL_SEND_SCOPE);
  });

  it("files are read only — no write, move or delete scope", () => {
    const drive = scopesForConnector("google_drive").filter(
      (s) => !GOOGLE_IDENTITY_SCOPES.includes(s),
    );
    expect(drive.length).toBeGreaterThan(0);
    expect(drive.every((s) => s.includes("readonly"))).toBe(true);
  });

  it("granting mail or files never touches the calendar grant", () => {
    expect(scopesForConnector("google_mail")).not.toContain(
      "https://www.googleapis.com/auth/calendar.events",
    );
    expect(scopesForConnector("google_drive")).not.toContain(
      "https://www.googleapis.com/auth/calendar.events",
    );
    expect(GOOGLE_CALENDAR_SCOPES).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("a service consent never merges another service's permissions in", () => {
    const mail = new Set(scopesForConnector("google_mail"));
    const drive = scopesForConnector("google_drive").filter((s) => !GOOGLE_IDENTITY_SCOPES.includes(s));
    expect(drive.some((s) => mail.has(s))).toBe(false);
  });
});

describe("health belongs to one service", () => {
  it("a person with calendar only stays calendar only", () => {
    const rows = [row({ connector_id: "google_calendar" })];
    expect(find(rows, "google_calendar").connected).toBe(true);
    expect(find(rows, "google_mail").connected).toBe(false);
    expect(find(rows, "google_drive").connected).toBe(false);
  });

  it("adding mail leaves calendar exactly as it was", () => {
    const before = find([row({ connector_id: "google_calendar" })], "google_calendar");
    const after = find(
      [row({ connector_id: "google_calendar" }), row({ connector_id: "google_mail" })],
      "google_calendar",
    );
    expect(after).toEqual(before);
  });

  it("adding files leaves calendar and mail alone", () => {
    const rows = [
      row({ connector_id: "google_calendar" }),
      row({ connector_id: "google_mail" }),
      row({ connector_id: "google_drive" }),
    ];
    expect(rows.length).toBe(3);
    expect(statuses(rows).every((s) => s.connected && !s.failing)).toBe(true);
  });

  it("broken mail never marks calendar or files broken", () => {
    const rows = [
      row({ connector_id: "google_calendar" }),
      row({ connector_id: "google_mail", last_error: "refused" }),
      row({ connector_id: "google_drive" }),
    ];
    expect(find(rows, "google_mail").failing).toBe(true);
    expect(find(rows, "google_calendar").failing).toBe(false);
    expect(find(rows, "google_drive").failing).toBe(false);
  });

  it("a service Google itself switched off carries the real fix, not 'switch it on again'", () => {
    const said =
      "Google has this service switched off for the account you signed in with. " +
      "Turn the Drive API on in that Google Cloud project, then Echo can read again.";
    const out = find([row({ connector_id: "google_drive", last_error: said })], "google_drive");
    expect(out.failing).toBe(true);
    expect(out.detail).toContain("Turn the Drive API on");
  });

  it("a service nobody switched on is never a failure", () => {
    const rows: ConnectionRow[] = [];
    expect(statuses(rows, "calendar blew up").every((s) => !s.failing)).toBe(true);
  });

  it("a recorded calendar sync failure still surfaces on calendar alone", () => {
    const rows = [row({ connector_id: "google_calendar" }), row({ connector_id: "google_drive" })];
    const out = statuses(rows, "google stopped answering");
    expect(out.find((s) => s.service === "google_calendar")!.failing).toBe(true);
    expect(out.find((s) => s.service === "google_drive")!.failing).toBe(false);
  });

  it("an unwired service is never offered as connectable", () => {
    const out = googleServiceStatuses({ rows: [], offerable: () => false });
    expect(out.every((s) => !s.offerable)).toBe(true);
  });
});

describe("what the Google card says", () => {
  const state = (rows: ConnectionRow[]) =>
    googleStateFrom({
      signedIn: rows.length > 0,
      account: rows[0]?.account_label ?? null,
      services: statuses(rows) as never,
    });

  it("signing in on its own promises nothing", () => {
    expect(accountLine(state([]))).toMatch(/gives Echo nothing/i);
    expect(accountReach(state([]))).toBe("available");
  });

  it("optional mail and files sit as available, never red", () => {
    const s = state([row({ connector_id: "google_calendar" })]);
    const mail = GOOGLE_CAPABILITIES.find((c) => c.key === "gmail")!;
    const drive = GOOGLE_CAPABILITIES.find((c) => c.key === "drive")!;
    expect(capabilityReach(mail, s)).toBe("available");
    expect(capabilityReach(drive, s)).toBe("available");
  });

  it("only a service that stopped working says needs you", () => {
    const s = state([
      row({ connector_id: "google_calendar" }),
      row({ connector_id: "google_mail", last_error: "refused" }),
    ]);
    const cal = GOOGLE_CAPABILITIES.find((c) => c.key === "calendar")!;
    const mail = GOOGLE_CAPABILITIES.find((c) => c.key === "gmail")!;
    expect(capabilityReach(cal, s)).toBe("connected");
    expect(capabilityReach(mail, s)).toBe("needs_you");
  });
});

describe("mail search stays narrow", () => {
  it("keeps the words a person said and drops the filler", () => {
    const q = mailSearchQuery("What did Nikki say about the pickup?");
    expect(q).toContain("nikki");
    expect(q).toContain("pickup");
    expect(q).not.toContain("what");
    expect(q).not.toContain("about");
  });

  it("never hands over the whole mailbox", () => {
    const q = mailSearchQuery("anything important about tomorrow");
    expect(q).toContain("newer_than:60d");
    expect(q).toContain("-category:promotions");
  });

  it("treats an address as a sender", () => {
    expect(mailSearchQuery("anything from dani@example.com")).toContain("from:dani@example.com");
  });

  it("says nothing when there is nothing", () => {
    expect(mailAnswer([])).toBeNull();
  });
});
