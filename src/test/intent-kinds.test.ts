import { describe, it, expect } from "vitest";
import { intentStagesApproval, stagedApprovalLine } from "@/lib/intentKinds";

describe("intent staging law — only real proposals may look like approval", () => {
  it("the staging tools are allowed to say they are waiting for approval", () => {
    expect(intentStagesApproval("stage_action")).toBe(true);
    expect(intentStagesApproval("stage_calendar_change")).toBe(true);
    expect(intentStagesApproval("refine_calendar_change")).toBe(true);
  });

  it("a staged proposal names what it drafted", () => {
    expect(stagedApprovalLine("stage_action", { title: "Email Dani the deck" }))
      .toBe("Drafted for approval: Email Dani the deck. Nothing has run.");
    expect(stagedApprovalLine("stage_action", {})).toBe("Drafted for approval. Nothing has run.");
  });

  it("every read-only lookup fails closed — never an approval line", () => {
    const reads = [
      "look_up", "check_page", "search_mail", "find_file",
      "query_awareness", "query_schedule", "travel_time", "where_do_i_stand",
    ];
    for (const name of reads) {
      expect(intentStagesApproval(name)).toBe(false);
      expect(stagedApprovalLine(name, { title: "Bangkok flooding" })).toBe("");
    }
  });

  it("watch actions leave receipts, never approval language", () => {
    for (const name of ["keep_an_eye_on", "stop_watching", "whats_being_watched"]) {
      expect(intentStagesApproval(name)).toBe(false);
      expect(stagedApprovalLine(name, { reference: "Bangkok flooding" })).toBe("");
    }
  });

  it("silent writers never claim to be waiting on approval", () => {
    const writers = ["capture_note", "set_reminder", "cancel_reminder", "add_commitment", "mark_waiting", "record_decision", "save_artifact", "run_sherlock"];
    for (const name of writers) {
      expect(intentStagesApproval(name)).toBe(false);
      expect(stagedApprovalLine(name, { title: "anything" })).toBe("");
    }
  });

  it("an unknown or half-parsed tool call can never fake an approval card", () => {
    expect(intentStagesApproval("stage_actio")).toBe(false);
    expect(intentStagesApproval("")).toBe(false);
    expect(stagedApprovalLine("not_a_tool", { title: "trick" })).toBe("");
    expect(stagedApprovalLine("undefined")).toBe("");
  });
});
