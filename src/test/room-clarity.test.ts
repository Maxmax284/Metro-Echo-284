// Clarity layer — the words and the familiarity rule.
//
// These guard the two failure modes we actually hit: a section shipping without
// a description, and helper copy that never gets out of the way.
import { describe, it, expect, beforeEach } from "vitest";
import {
  ROOM_EXPLAIN,
  ROOM_HELP,
  ROOM_HELP_ORDER,
  ROOM_INTRO,
  SECTION_NOTE,
  sectionNote,
  type RoomHelpCopy,
} from "@/lib/roomCopy";

import { FAMILIAR_AFTER, isFamiliar } from "@/hooks/useHelperFamiliarity";
import { receiptFacts } from "@/components/audit/ReceiptUnfold";
import { continuityName } from "@/lib/continuity";

const JARGON = /\b(RLS|payload|API|CRUD|webhook|schema|JSON|endpoint|UUID)\b/;

describe("room copy", () => {
  it("gives every room a one-line intro and a grounded explanation", () => {
    for (const key of Object.keys(ROOM_INTRO) as (keyof typeof ROOM_INTRO)[]) {
      expect(ROOM_INTRO[key].length).toBeGreaterThan(10);
      expect(ROOM_INTRO[key].length).toBeLessThan(90);
      expect(ROOM_EXPLAIN[key].length).toBeGreaterThan(1);
    }
  });

  it("keeps section notes short, plain, and jargon-free", () => {
    for (const key of Object.keys(SECTION_NOTE) as (keyof typeof SECTION_NOTE)[]) {
      const note = sectionNote(key);
      expect(note.length).toBeLessThan(80);
      expect(note.endsWith(".")).toBe(true);
      expect(JARGON.test(note)).toBe(false);
    }
  });

  it("never leaks jargon into a room explanation", () => {
    for (const lines of Object.values(ROOM_EXPLAIN)) {
      for (const l of lines) expect(JARGON.test(l)).toBe(false);
    }
  });
});

describe("room help", () => {
  it("answers the same six questions for every room", () => {
    for (const key of Object.keys(ROOM_HELP) as (keyof typeof ROOM_HELP)[]) {
      for (const { key: field } of ROOM_HELP_ORDER) {
        const line = ROOM_HELP[key][field];
        expect(line.length).toBeGreaterThan(20);
        expect(line.endsWith(".")).toBe(true);
        expect(JARGON.test(line)).toBe(false);
      }
    }
  });

  it("keeps the question order fixed and complete", () => {
    expect(ROOM_HELP_ORDER.map((q) => q.key)).toEqual([
      "forWhat",
      "lands",
      "canDo",
      "never",
      "next",
      "empty",
    ]);
  });

  it("states a real limit in every room's never line", () => {
    for (const help of Object.values(ROOM_HELP) as RoomHelpCopy[]) {
      expect(/\bnever\b|\bnothing\b|\bcannot\b/i.test(help.never)).toBe(true);
    }
  });
});


describe("helper familiarity", () => {
  beforeEach(() => window.localStorage.clear());

  it("explains for the first few visits then stands down", () => {
    expect(isFamiliar("k", 0)).toBe(false);
    expect(isFamiliar("k", FAMILIAR_AFTER - 1)).toBe(false);
    expect(isFamiliar("k", FAMILIAR_AFTER)).toBe(true);
    expect(isFamiliar("k", FAMILIAR_AFTER + 20)).toBe(true);
  });
});

describe("receipt facts", () => {
  it("reads before/after, actor, and source off the record", () => {
    const f = receiptFacts(
      {
        event: "action.approved",
        entity_type: "action",
        payload: { from_status: "proposed", to_status: "approved", actor: "you", source: "telegram" },
      },
      "Action approved",
    );
    expect(f).toMatchObject({
      what: "Action approved",
      before: "proposed",
      after: "approved",
      actor: "you",
      source: "telegram",
      reversed: false,
    });
  });

  it("leaves unknown facts missing instead of inventing them", () => {
    const f = receiptFacts({ event: "note.created", entity_type: "note", payload: {} }, "Note created");
    expect(f.before).toBeNull();
    expect(f.after).toBeNull();
    expect(f.actor).toBeNull();
  });

  it("marks a reversal from the event name", () => {
    const f = receiptFacts({ event: "action.rolled_back", entity_type: "action" }, "Action rolled back");
    expect(f.reversed).toBe(true);
  });
});

describe("continuity naming", () => {
  const base = {
    key: "k",
    projectId: null,
    projectTitle: null,
    score: 1,
    state: "active" as const,
    reason: null,
    lastActivityAt: new Date().toISOString(),
    anchorAt: null,
    anchorConfidence: "none" as const,
    summary: "",
    unresolved: [],
    decisions: [],
    sources: [],
    activityCount: 1,
    pinned: false,
    related: [],
  };

  it("prefers a project title", () => {
    expect(continuityName({ ...base, projectTitle: "Lamai rollout" } as any)).toBe("Lamai rollout");
  });

  it("falls back to the record actually behind the work", () => {
    const named = continuityName({
      ...base,
      unresolved: [{ label: "Send Nikki the waiver draft" }],
    } as any);
    expect(named).toBe("Send Nikki the waiver draft");
  });

  it("says so plainly when there is nothing to name it after", () => {
    expect(continuityName(base as any)).toBe("Not filed under a project yet");
  });
});
