import { describe, expect, it } from "vitest";
import {
  MAIL_QUERY, buildRawReply, displayName, emailAddress, mailConclusion,
  plainTextFromPayload, replySubject, stripHtml, toMailItem, type MailItem,
} from "../../supabase/functions/_shared/mailRead";
import {
  driveKindLabel, driveQuery, readPathFor, readableAsText,
} from "../../supabase/functions/_shared/driveRead";

const item = (over: Partial<MailItem>): MailItem => ({
  id: "m1",
  threadId: "t1",
  from: "dani@example.com",
  fromName: "Dani",
  subject: "Friday",
  date: null,
  snippet: "",
  unread: true,
  ...over,
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("mail as one conclusion", () => {
  it("says nothing when nothing is waiting", () => {
    expect(mailConclusion([])).toBeNull();
    expect(mailConclusion([item({ unread: false })])).toBeNull();
  });

  it("names one person when one person is waiting", () => {
    expect(mailConclusion([item({})])).toBe("Dani is waiting on a reply.");
  });

  it("bundles rather than giving each message a card", () => {
    const many = [
      item({ id: "a", fromName: "Dani" }),
      item({ id: "b", fromName: "Dani" }),
    ];
    expect(mailConclusion(many)).toBe("Dani sent 2 that are waiting on you.");
    const two = [item({ id: "a", fromName: "Dani" }), item({ id: "b", fromName: "Nikki" })];
    expect(mailConclusion(two)).toBe("Dani and Nikki are waiting on a reply.");
    const three = [
      item({ id: "a", fromName: "Dani" }),
      item({ id: "b", fromName: "Nikki" }),
      item({ id: "c", fromName: "Sam" }),
    ];
    expect(mailConclusion(three)).toMatch(/^3 are waiting on you, including Dani and Nikki\.$/);
  });

  it("never sweeps up promotions or chats", () => {
    expect(MAIL_QUERY).toContain("is:unread");
    expect(MAIL_QUERY).toContain("-category:promotions");
    expect(MAIL_QUERY).toContain("-in:chats");
  });

  it("reads a person's name and address out of a From header", () => {
    expect(displayName('"Dani Rivera" <dani@example.com>')).toBe("Dani Rivera");
    expect(emailAddress("Dani Rivera <dani@example.com>")).toBe("dani@example.com");
    expect(displayName("first.last@example.com")).toBe("first last");
  });

  it("keeps a message with no subject honest", () => {
    const parsed = toMailItem({ id: "x", threadId: "y", payload: { headers: [] } });
    expect(parsed.subject).toBe("(no subject)");
    expect(parsed.unread).toBe(false);
  });

  it("prefers plain text over html, and strips html when that is all there is", () => {
    const plain = plainTextFromPayload({
      parts: [
        { mimeType: "text/html", body: { data: b64url("<p>hi</p>") } },
        { mimeType: "text/plain", body: { data: b64url("hello there") } },
      ],
    });
    expect(plain).toBe("hello there");
    expect(stripHtml("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("does not stack Re: on a reply subject", () => {
    expect(replySubject("Friday")).toBe("Re: Friday");
    expect(replySubject("Re: Friday")).toBe("Re: Friday");
  });

  it("builds a threaded reply that carries no stray padding", () => {
    const raw = buildRawReply({
      to: "dani@example.com",
      subject: "Re: Friday",
      body: "Works for me.",
      inReplyTo: "<abc@mail>",
      references: "<abc@mail>",
    });
    expect(raw).not.toContain("=");
    const decoded = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + "==");
    expect(decoded).toContain("In-Reply-To: <abc@mail>");
    expect(decoded).toContain("Works for me.");
  });
});

describe("drive: finding is not reading", () => {
  it("only ever lists files that are not in the bin", () => {
    expect(driveQuery("")).toBe("trashed = false");
    expect(driveQuery("lease")).toBe("trashed = false and name contains 'lease'");
  });

  it("cannot be talked into a different query with quotes", () => {
    expect(driveQuery("a' or name contains 'b")).not.toContain("'a'");
    expect(driveQuery("a' or name contains 'b")).toBe(
      "trashed = false and name contains 'a or name contains b'",
    );
  });

  it("says plainly which files it can turn into words", () => {
    expect(readableAsText("application/vnd.google-apps.document")).toBe(true);
    expect(readableAsText("text/plain")).toBe(true);
    expect(readableAsText("image/png")).toBe(false);
    expect(readPathFor("f1", "image/png")).toBeNull();
  });

  it("exports a Google doc instead of downloading it raw", () => {
    expect(readPathFor("f1", "application/vnd.google-apps.document")).toContain("/export?mimeType=text%2Fplain");
    expect(readPathFor("f1", "text/plain")).toBe("/drive/v3/files/f1?alt=media");
  });

  it("labels a file the way a person would say it", () => {
    expect(driveKindLabel("application/vnd.google-apps.spreadsheet")).toBe("Sheet");
    expect(driveKindLabel("application/pdf")).toBe("PDF");
    expect(driveKindLabel("image/jpeg")).toBe("Image");
    expect(driveKindLabel("application/octet-stream")).toBe("File");
  });
});
