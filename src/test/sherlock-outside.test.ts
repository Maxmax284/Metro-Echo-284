import { describe, expect, it } from "vitest";
import {
  driveContextLine,
  mailContextLine,
  outsideNote,
  outsideTerm,
} from "../../supabase/functions/_shared/sherlockOutside";

describe("sherlock outside sources", () => {
  it("pulls the real subject words out of a question", () => {
    expect(outsideTerm("did anyone email me about the storage unit?")).toBe("storage");
    expect(outsideTerm("any files about my thailand visa")).toBe("thailand");
    expect(outsideTerm("what did you find")).toBe("");
  });

  it("says a mail line with sender, subject and when — never a body", () => {
    const line = mailContextLine(
      { id: "m1", fromName: "Dani", subject: "Storage keys", snippet: "picking them up", unread: true },
      "Mon Sep 14, 9:12 AM",
    );
    expect(line).toContain("(mail:m1)");
    expect(line).toContain("Storage keys");
    expect(line).toContain("from Dani");
    expect(line).toContain("Mon Sep 14, 9:12 AM");
    expect(line).toContain("unread");
  });

  it("says a file line with name, kind and when it changed", () => {
    const line = driveContextLine(
      { id: "f1", name: "Visa copy.pdf", kind: "PDF", modifiedAt: null, link: null },
      "Fri Sep 11",
    );
    expect(line).toContain("(file:f1) Visa copy.pdf");
    expect(line).toContain("PDF");
    expect(line).toContain("changed Fri Sep 11");
  });

  it("is honest when a source could not be read, and silent when it could", () => {
    expect(outsideNote("Gmail", "read")).toBeNull();
    expect(outsideNote("Gmail", "not_connected")).toContain("not switched on");
    expect(outsideNote("Drive", "needs_you")).toContain("signing in again");
    expect(outsideNote("Drive", "failed")).toContain("could not be reached");
  });
});
