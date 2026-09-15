import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Deleting a disposable chat must never erase evidence of consequential work.
 * A thread is soft-deleted, and the deletion itself leaves a receipt. These are
 * source invariants because the rule lives in one place and must stay there.
 */
const provider = readFileSync("src/providers/AskThreadProvider.tsx", "utf8");

describe("deleting a chat keeps the receipts", () => {
  it("soft-deletes the thread instead of removing the row", () => {
    expect(provider).toMatch(/deleted_at: now/);
    expect(provider).not.toMatch(/from\("conversations"\)[\s\S]{0,80}\.delete\(/);
  });

  it("never deletes messages, actions, commitments or the audit log", () => {
    for (const table of ["messages", "actions", "commitments", "audit_log", "notes"]) {
      expect(provider).not.toMatch(new RegExp(`from\\("${table}"\\)[\\s\\S]{0,80}\\.delete\\(`));
    }
  });

  it("records the deletion as its own audit event", () => {
    expect(provider).toContain('from("audit_log")');
    expect(provider).toContain("ask.thread.deleted");
  });
});
