// Reach is a promise. These tests keep it honest.
import { describe, expect, it } from "vitest";
import {
  abilityAnswer,
  abilityLine,
  echoAbilities,
  matchAbilityQuestion,
  type AbilityFacts,
} from "@/lib/echoAbilities";

const NOTHING: AbilityFacts = {
  calendar: false,
  mail: false,
  files: false,
  telegram: false,
  web_search: false,
  watching: 0,
};

const ALL: AbilityFacts = {
  calendar: true,
  mail: true,
  files: true,
  telegram: true,
  web_search: true,
  watching: 3,
};

describe("echoAbilities", () => {
  it("never marks an unconnected source as live", () => {
    const rows = echoAbilities(NOTHING);
    for (const id of ["calendar", "mail", "files", "telegram", "search"]) {
      const row = rows.find((r) => r.id === id)!;
      expect(row.state).toBe("needs_connecting");
      expect(row.because).toBeTruthy();
    }
  });

  it("keeps portal sign-in impossible even with everything connected", () => {
    const row = echoAbilities(ALL).find((r) => r.id === "portal")!;
    expect(row.state).toBe("not_yet");
  });

  it("states limits on mail, files and messaging", () => {
    const rows = echoAbilities(ALL);
    expect(rows.find((r) => r.id === "mail")!.limit).toMatch(/never sends/i);
    expect(rows.find((r) => r.id === "files")!.limit).toMatch(/never edits/i);
    expect(rows.find((r) => r.id === "telegram")!.limit).toMatch(/Nothing runs/i);
  });

  it("counts the watching total from the record, not a guess", () => {
    expect(echoAbilities(ALL).find((r) => r.id === "watch")!.plain).toContain("3 being watched");
    expect(echoAbilities(NOTHING).find((r) => r.id === "watch")!.plain).not.toMatch(/\d/);
  });

  it("summarises live and waiting counts", () => {
    expect(abilityLine(echoAbilities(ALL))).toMatch(/Nothing is waiting on a connection/);
    expect(abilityLine(echoAbilities(NOTHING))).toMatch(/5 more once you connect/);
  });

  it("ends the chat answer with the law", () => {
    expect(abilityAnswer(echoAbilities(ALL))).toMatch(/Nothing on this list acts on its own\.$/);
  });

  it("recognises reach questions and ignores unrelated ones", () => {
    expect(matchAbilityQuestion("what can you do?")).toBe(true);
    expect(matchAbilityQuestion("What are your capabilities")).toBe(true);
    expect(matchAbilityQuestion("what can echo do for me")).toBe(true);
    expect(matchAbilityQuestion("where do I stand?")).toBe(false);
    expect(matchAbilityQuestion("")).toBe(false);
  });
});
