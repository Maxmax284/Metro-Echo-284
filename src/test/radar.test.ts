import { describe, it, expect } from "vitest";
import {
  radarModel, checkWords, needsAttention, spanWords, quietHeadline, quietBoardLine, debriefPrompt,
  RADAR_BEHIND_MS, RADAR_FAILED_NEWS_MS,
} from "@/lib/radar";
import type { Watch } from "@/lib/watch";

const NOW = Date.parse("2026-09-28T12:00:00Z");

let seq = 0;
function watch(p: Partial<Watch>): Watch {
  seq += 1;
  return {
    id: `w${seq}`,
    goal: "Keep an eye on the page",
    kind: "web_page",
    subject_id: null,
    state: "watching",
    last_check_at: new Date(NOW - 30 * 60_000).toISOString(),
    next_check_at: new Date(NOW + 30 * 60_000).toISOString(),
    attempts: 4,
    outcome: null,
    last_read: null,
    created_at: new Date(NOW - 86_400_000).toISOString(),
    updated_at: new Date(NOW - 30 * 60_000).toISOString(),
    ...p,
  };
}

describe("spanWords", () => {
  it("speaks in rough spans, never false precision", () => {
    expect(spanWords(45 * 60_000)).toBe("45 min");
    expect(spanWords(3 * 3_600_000)).toBe("3 h");
    expect(spanWords(2 * 86_400_000)).toBe("2 d");
  });
});

describe("checkWords", () => {
  it("pairs the last check with the next expected one", () => {
    const w = watch({});
    expect(checkWords(w, NOW)).toBe("Checked 30 min ago · next in ~30 min");
  });

  it("says so when a watch has never been checked", () => {
    const w = watch({ last_check_at: null });
    expect(checkWords(w, NOW)).toBe("Not checked yet · next in ~30 min");
  });

  it("reads due-now instead of pretending a future", () => {
    const w = watch({ next_check_at: new Date(NOW - 5 * 60_000).toISOString() });
    expect(checkWords(w, NOW)).toContain("next check due now");
  });

  it("marks a paused watch instead of a next check", () => {
    const w = watch({ state: "paused" });
    expect(checkWords(w, NOW)).toBe("Checked 30 min ago · paused");
  });
});

describe("needsAttention", () => {
  it("raises a hand for needs_you", () => {
    expect(needsAttention(watch({ state: "needs_you" }), NOW)).toBe(true);
  });

  it("treats a recent failure as news, an old one as history", () => {
    const fresh = watch({ state: "couldnt_finish", updated_at: new Date(NOW - 2 * 3_600_000).toISOString() });
    const stale = watch({ state: "couldnt_finish", updated_at: new Date(NOW - RADAR_FAILED_NEWS_MS - 60_000).toISOString() });
    expect(needsAttention(fresh, NOW)).toBe(true);
    expect(needsAttention(stale, NOW)).toBe(false);
  });

  it("calls an overdue check behind, never quiet", () => {
    const behind = watch({ next_check_at: new Date(NOW - RADAR_BEHIND_MS - 60_000).toISOString() });
    const onTime = watch({});
    expect(needsAttention(behind, NOW)).toBe(true);
    expect(needsAttention(onTime, NOW)).toBe(false);
  });

  it("never raises a hand for a paused watch", () => {
    const w = watch({ state: "paused", next_check_at: new Date(NOW - 10 * RADAR_BEHIND_MS).toISOString() });
    expect(needsAttention(w, NOW)).toBe(false);
  });
});

describe("radarModel", () => {
  it("is empty when nothing is being watched", () => {
    expect(radarModel([], NOW)).toEqual({ kind: "empty" });
  });

  it("is empty once a failure has aged out of the news window", () => {
    const stale = watch({ state: "couldnt_finish", updated_at: new Date(NOW - 2 * RADAR_FAILED_NEWS_MS).toISOString() });
    expect(radarModel([stale], NOW)).toEqual({ kind: "empty" });
  });

  it("is quiet when open watches need nothing", () => {
    const model = radarModel([watch({}), watch({})], NOW);
    expect(model.kind).toBe("quiet");
    if (model.kind === "quiet") {
      expect(model.openCount).toBe(2);
      expect(model.rows).toHaveLength(2);
      expect(quietHeadline(model.openCount)).toBe("Watching 2 things — nothing has moved.");
    }
  });

  it("keeps paused watches visible inside the quiet count-out", () => {
    const model = radarModel([watch({}), watch({ state: "paused" })], NOW);
    expect(model.kind).toBe("quiet");
    if (model.kind === "quiet") {
      expect(model.openCount).toBe(1);
      expect(model.rows).toHaveLength(2);
    }
  });

  it("raises attention with a plain headline when something needs you", () => {
    const model = radarModel([watch({}), watch({ state: "needs_you" })], NOW);
    expect(model.kind).toBe("attention");
    if (model.kind === "attention") {
      expect(model.headline).toBe("1 watch needs you");
      expect(model.rows[0].needsAttention).toBe(true);
    }
  });

  it("combines failure and behind counts in one headline", () => {
    const model = radarModel([
      watch({ state: "couldnt_finish", updated_at: new Date(NOW - 60_000).toISOString() }),
      watch({ next_check_at: new Date(NOW - 2 * RADAR_BEHIND_MS).toISOString() }),
      watch({ next_check_at: new Date(NOW - 3 * RADAR_BEHIND_MS).toISOString() }),
    ], NOW);
    expect(model.kind).toBe("attention");
    if (model.kind === "attention") {
      expect(model.headline).toBe("1 watch couldn't finish · 2 watches are behind on checks");
    }
  });

  it("sorts attention rows before quiet ones", () => {
    const model = radarModel([watch({}), watch({ state: "needs_you" })], NOW);
    if (model.kind !== "attention") throw new Error("expected attention");
    expect(model.rows[0].state).toBe("needs_you");
  });

  it("carries the headline Echo actually saw onto the row", () => {
    const model = radarModel([watch({ last_read: "River steady at Bang Sai gauge" })], NOW);
    if (model.kind === "empty") throw new Error("expected rows");
    expect(model.rows[0].latest).toBe("River steady at Bang Sai gauge");
  });
});

describe("debriefPrompt", () => {
  it("folds a topic watch back into how a person asks", () => {
    expect(debriefPrompt("Watch the web for “Bangkok flooding”")).toBe("Catch me up on Bangkok flooding.");
  });

  it("never doubles punctuation the goal already carries", () => {
    expect(debriefPrompt("Watch the web for “What's going on with the Bangkok flooding?”")).toBe(
      "Catch me up on What's going on with the Bangkok flooding?",
    );
  });

  it("folds a page watch with a reason into one question", () => {
    expect(debriefPrompt("Watch vendor.example — the price drop")).toBe(
      "Catch me up on the price drop (vendor.example).",
    );
  });

  it("folds a bare page watch into a what's-new", () => {
    expect(debriefPrompt("Watch status.example for changes")).toBe("What's new on status.example?");
  });

  it("passes any other goal through with the watch named", () => {
    expect(debriefPrompt("Keep an eye on the gate change")).toBe(
      "Catch me up on this: Keep an eye on the gate change",
    );
  });
});

describe("quietBoardLine", () => {
  it("puts the freshest recorded read on the board while the radar is quiet", () => {
    const model = radarModel([watch({ last_read: "Now: 29°C, overcast.\nAdvisory: calm seas." })], NOW);
    expect(model.kind).toBe("quiet");
    if (model.kind === "quiet") {
      expect(model.boardLine).toBe("Now: 29°C, overcast.");
    }
  });

  it("stays null when no watch has a read on record yet", () => {
    const model = radarModel([watch({})], NOW);
    expect(model.kind).toBe("quiet");
    if (model.kind === "quiet") {
      expect(model.boardLine).toBeNull();
    }
  });

  it("skips empty reads and caps the line for the flap board", () => {
    const rows = [
      { id: "1", goal: "a", state: "watching" as const, stateLabel: "Watching", check: "", latest: null, needsAttention: false },
      { id: "2", goal: "b", state: "watching" as const, stateLabel: "Watching", check: "", latest: `  \n${"x".repeat(200)}`, needsAttention: false },
    ];
    const line = quietBoardLine(rows);
    expect(line).not.toBeNull();
    expect(line!.length).toBeLessThanOrEqual(110);
    expect(line!.endsWith("…")).toBe(true);
  });
});
