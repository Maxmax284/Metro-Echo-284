import { describe, it, expect } from "vitest";
import {
  inputKindForFile,
  readabilityFor,
  sizeLabel,
  suggestionsForContext,
  contextKindLabel,
  contextHref,
  contextStripParts,
  attachmentHints,
  processingLabel,
} from "@/lib/askCapabilities";

describe("attachment classification", () => {
  it("reads mime first and filename as fallback", () => {
    expect(inputKindForFile({ name: "a.png", type: "image/png" })).toBe("image");
    expect(inputKindForFile({ name: "contract.pdf", type: "" })).toBe("document");
    expect(inputKindForFile({ name: "note.m4a", type: "" })).toBe("audio");
    expect(inputKindForFile({ name: "clip.mov", type: "video/quicktime" })).toBe("video");
    expect(inputKindForFile({ name: "archive.zip", type: "application/zip" })).toBe("other");
  });

  it("is honest about what it cannot read yet", () => {
    expect(readabilityFor("image").readable).toBe(true);
    expect(readabilityFor("document").readable).toBe(true);
    const video = readabilityFor("video");
    expect(video.readable).toBe(false);
    expect(video.note.toLowerCase()).toContain("can't watch video yet");
  });

  it("labels size only when it is worth showing", () => {
    expect(sizeLabel(400)).toBe("");
    expect(sizeLabel(2048)).toBe("2 KB");
    expect(sizeLabel(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("sends kinds and names, never bytes", () => {
    const hints = attachmentHints([{ name: "nda.pdf", type: "application/pdf", ingestedFileId: "f1" }]);
    expect(hints).toEqual([{ kind: "document", name: "nda.pdf", readable: true, ingested_file_id: "f1" }]);
  });
});

describe("capability-aware suggestions", () => {
  it("offers a few context-specific moves, never a toolbar", () => {
    const project = suggestionsForContext("project");
    expect(project.length).toBeLessThanOrEqual(4);
    expect(project.map((s) => s.id)).toContain("resume");
    expect(suggestionsForContext("receipt").map((s) => s.id)).toEqual(["explain", "trace", "source"]);
  });

  it("lets attachments win over context", () => {
    const s = suggestionsForContext("project", { hasAttachment: true });
    expect(s.map((x) => x.id)).toEqual(["read", "identify", "file"]);
  });

  it("falls back to cross-project questions with no binding", () => {
    expect(suggestionsForContext(null).map((s) => s.id)).toContain("waiting");
  });

  it("never auto-sends: every suggestion is a prefilled question", () => {
    for (const kind of ["project", "document", "today"] as const) {
      for (const s of suggestionsForContext(kind)) expect(s.question.length).toBeGreaterThan(3);
    }
  });
});

describe("context strip", () => {
  it("leads with scope and names the bound object", () => {
    expect(
      contextStripParts({ scopeLabel: "Workspace", kind: "project", objectLabel: "CampStay" }),
    ).toEqual(["Workspace", "Project", "CampStay"]);
    expect(contextStripParts({ scopeLabel: "Personal" })).toEqual(["Personal"]);
  });

  it("gives every bound kind somewhere to travel", () => {
    expect(contextKindLabel("action")).toBe("Draft");
    expect(contextHref("project", "p1")).toBe("/projects/p1");
    expect(contextHref("commitment", "c1")).toBe("/?commitment=c1");
    expect(contextHref("receipt", null)).toBe("/?surface=receipts");
    expect(contextHref(null, null)).toBeNull();
  });
});

describe("processingLabel", () => {
  it("names what it is actually reading", () => {
    expect(processingLabel("reading", [{ kind: "document" }])).toBe("Reading the document");
    expect(processingLabel("reading", [{ kind: "image" }])).toBe("Looking at the image");
    expect(processingLabel("reading", [{ kind: "audio" }])).toBe("Listening to the recording");
  });

  it("falls back to context when nothing is attached", () => {
    expect(processingLabel("reading")).toBe("Processing");
  });

  it("says writing once tokens arrive", () => {
    expect(processingLabel("writing", [{ kind: "document" }])).toBe("Writing");
  });
});
