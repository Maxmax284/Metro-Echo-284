import { describe, it, expect } from "vitest";
import {
  ECHO_READ_NAMES,
  ECHO_READ_TOOLS,
  READ_SOURCE,
  isEchoRead,
  readsBlock,
  readProvenance,
  type EchoReadResult,
} from "@/lib/echoReads";

const result = (name: EchoReadResult["name"], text: string): EchoReadResult => ({
  name,
  text,
  source: READ_SOURCE[name],
});

describe("echo reads — one catalog, both surfaces", () => {
  it("declares every read exactly once", () => {
    const names = ECHO_READ_TOOLS.map((t) => t.function.name);
    expect(names).toEqual([...ECHO_READ_NAMES]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("says every read is read-only in its own description", () => {
    for (const t of ECHO_READ_TOOLS) {
      expect(t.function.description.toLowerCase()).toContain("read-only");
    }
  });

  it("names a plain-English source for every read", () => {
    for (const name of ECHO_READ_NAMES) {
      expect(READ_SOURCE[name]).toBeTruthy();
      expect(READ_SOURCE[name]).not.toMatch(/_/);
    }
  });

  it("recognises only reads it owns", () => {
    expect(isEchoRead("where_do_i_stand")).toBe(true);
    // Writes and staging must never be mistaken for a read.
    expect(isEchoRead("stage_calendar_change")).toBe(false);
    expect(isEchoRead("capture_note")).toBe(false);
    expect(isEchoRead("")).toBe(false);
  });
});

describe("echo reads — how the results reach the model", () => {
  it("says nothing when nothing was read", () => {
    expect(readsBlock([])).toBe("");
    expect(readProvenance([])).toEqual([]);
  });

  it("hands the read back as recorded fact, not as the answer", () => {
    const block = readsBlock([result("whats_waiting", "Two drafts waiting on your yes.")]);
    expect(block).toContain("Two drafts waiting on your yes.");
    expect(block).toContain("answer FROM them");
    expect(block).toContain("ONE conclusion");
    expect(block).toMatch(/never paste a read back verbatim/i);
  });

  it("forbids inventing or rounding a count", () => {
    const block = readsBlock([result("whats_due", "Nothing due in the next 7 days.")]);
    expect(block).toMatch(/never restate a count these reads do not contain/i);
    expect(block).toMatch(/round one up/i);
  });

  it("treats empty as a real answer", () => {
    expect(readsBlock([result("whats_changed", "Nothing moved.")])).toMatch(
      /Empty is a real answer/i,
    );
  });

  it("turns reads into provenance a person can read", () => {
    const lines = readProvenance([
      result("where_do_i_stand", "..."),
      result("project_status", "..."),
    ]);
    expect(lines).toEqual(["Read the whole board", "Read one project's record"]);
  });
});
