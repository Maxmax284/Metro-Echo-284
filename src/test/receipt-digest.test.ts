import { describe, expect, it } from "vitest";
import { isQuietRecord, receiptDigest, type DigestActionEvent, type DigestAuditRow } from "@/lib/receiptDigest";

const row = (event: string, entity_type: string, created_at: string): DigestAuditRow => ({
  id: `${event}-${created_at}`,
  event,
  entity_type,
  created_at,
});

const ev = (to_status: string, actor: string, created_at: string): DigestActionEvent => ({
  id: `${to_status}-${created_at}`,
  to_status,
  actor,
  created_at,
});

describe("receiptDigest", () => {
  it("returns the six front lines in a fixed order", () => {
    const lines = receiptDigest([], []);
    expect(lines.map((l) => l.key)).toEqual([
      "happened",
      "echo_did",
      "you_approved",
      "failed",
      "held_back",
      "outside",
    ]);
  });

  it("says nothing happened without inventing content", () => {
    const lines = receiptDigest([], []);
    expect(isQuietRecord(lines)).toBe(true);
    expect(lines[0].sentence).toBe("Nothing has happened yet.");
    expect(lines.every((l) => l.at === null)).toBe(true);
  });

  it("counts what Echo did but excludes failures and held-back rows", () => {
    const lines = receiptDigest(
      [
        row("action_executed", "action", "2026-09-11T10:00:00Z"),
        row("reminder_sent", "reminder", "2026-09-11T10:05:00Z"),
        row("action_execute_failed", "action", "2026-09-11T10:06:00Z"),
        row("nudge_held_back", "nudge", "2026-09-11T10:07:00Z"),
      ],
      [],
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.echo_did.count).toBe(2);
    expect(by.failed.count).toBe(1);
    expect(by.held_back.count).toBe(1);
    expect(by.happened.count).toBe(4);
  });

  it("only counts human approvals", () => {
    const lines = receiptDigest([], [ev("approved", "user", "2026-09-11T09:00:00Z"), ev("approved", "system", "2026-09-11T09:01:00Z")]);
    const approved = lines.find((l) => l.key === "you_approved")!;
    expect(approved.count).toBe(1);
    expect(approved.at).toBe("2026-09-11T09:00:00Z");
  });

  it("counts a delivered heads-up as something Echo did, a failed one as failed", () => {
    const lines = receiptDigest(
      [
        row("nudge.delivered", "flight_plan", "2026-09-11T10:00:00Z"),
        row("nudge.reached_messaging", "watch", "2026-09-11T10:05:00Z"),
        row("nudge.delivery_failed", "watch", "2026-09-11T10:06:00Z"),
      ],
      [],
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.echo_did.count).toBe(2);
    expect(by.failed.count).toBe(1);
  });

  it("keeps quiet watch checks out of the Echo-did line", () => {
    const lines = receiptDigest([row("watch.checked", "watch", "2026-09-11T10:00:00Z")], []);
    expect(lines.find((l) => l.key === "echo_did")!.count).toBe(0);
    expect(lines.find((l) => l.key === "happened")!.count).toBe(1);
  });

  it("treats calendar and message rows as outside changes", () => {
    const lines = receiptDigest(
      [row("event_changed", "calendar_event", "2026-09-11T08:00:00Z"), row("note_created", "note", "2026-09-11T08:10:00Z")],
      [],
    );
    expect(lines.find((l) => l.key === "outside")!.count).toBe(1);
  });

  it("keeps every sentence plain — no backend words", () => {
    const lines = receiptDigest([row("action_executed", "action", "2026-09-11T10:00:00Z")], []);
    for (const l of lines) {
      expect(l.sentence).not.toMatch(/audit|entity|payload|status|row|table/i);
      expect(l.sentence.endsWith(".")).toBe(true);
    }
  });

  it("reports the newest matching moment per line", () => {
    const lines = receiptDigest(
      [row("action_executed", "action", "2026-09-11T10:00:00Z"), row("action_executed", "action", "2026-09-11T12:00:00Z")],
      [],
    );
    expect(lines.find((l) => l.key === "echo_did")!.at).toBe("2026-09-11T12:00:00Z");
  });
});
