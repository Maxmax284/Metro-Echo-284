// What the board says out loud: terminal, gate, how late, when it lands.
import { describe, expect, it } from "vitest";
import { gateBoardWords, type BoardFacts } from "../../supabase/functions/_shared/gateBoard.ts";

const now = new Date("2026-09-23T02:00:00Z");

function facts(over: Partial<BoardFacts> = {}): BoardFacts {
  return {
    flightNo: "PG165",
    status: "scheduled",
    departure: { iata: "BKK", terminal: "1", gate: "B7", at: "2026-09-23T15:55:00", delayMin: null },
    arrival: { iata: "USM", terminal: null, gate: null, at: "2026-09-23T17:10:00", delayMin: null },
    ...over,
  };
}

describe("the board, said out loud", () => {
  it("leads with terminal, gate and the landing time", () => {
    const said = gateBoardWords(facts(), now).join(" ");
    expect(said).toContain("Terminal 1, gate B7.");
    expect(said).toContain("Lands");
    expect(said).toContain("PG165 leaves");
  });

  it("says a missing gate is missing instead of inventing one", () => {
    const said = gateBoardWords(facts({ departure: { ...facts().departure, gate: null } }), now).join(" ");
    expect(said).toContain("No gate posted yet");
  });

  it("names a real delay and ignores a trivial one", () => {
    expect(gateBoardWords(facts({ departure: { ...facts().departure, delayMin: 25 } }), now).join(" ")).toContain(
      "Running 25 minutes late.",
    );
    expect(gateBoardWords(facts({ departure: { ...facts().departure, delayMin: 2 } }), now).join(" ")).not.toContain(
      "late",
    );
  });

  it("switches to the arrival end once it is flying", () => {
    const said = gateBoardWords(
      facts({ status: "active", arrival: { ...facts().arrival, terminal: "2", gate: "C4" } }),
      now,
    ).join(" ");
    expect(said).toContain("in the air");
    expect(said).toContain("Terminal 2, gate C4.");
  });

  it("reports a landing on the arrival facts", () => {
    const said = gateBoardWords(
      facts({ status: "landed", arrival: { ...facts().arrival, at: "2026-09-23T17:02:00", landed: true, terminal: "1" } }),
      now,
    ).join(" ");
    expect(said).toContain("is down");
    expect(said).toContain("Terminal 1");
  });

  it("calls out a terminal change at a layover", () => {
    const said = gateBoardWords(
      facts({ layover: { iata: "BKK", arriveTerminal: "1", departTerminal: "2", terminalChange: "yes" } }),
      now,
    ).join(" ");
    expect(said).toContain("you switch terminals");
  });

  it("stays quiet when there is not one real fact", () => {
    expect(
      gateBoardWords({
        flightNo: "PG165",
        status: null,
        departure: { iata: null, terminal: null, gate: null, at: null, delayMin: null },
        arrival: { iata: null, terminal: null, gate: null, at: null, delayMin: null },
      }),
    ).toEqual([]);
  });
});

describe("a finished leg beats a stale reading", () => {
  it("never says in the air when the journey says the leg is done", () => {
    const said = gateBoardWords(
      {
        flightNo: "PG165",
        status: "active",
        settled: true,
        departure: { iata: "BKK", terminal: "1", gate: "B7", at: "2026-09-20T15:55:00", delayMin: null },
        arrival: { iata: "USM", terminal: null, gate: null, at: "2026-09-20T17:08:00", delayMin: 24 },
      },
      new Date("2026-09-23T02:00:00Z"),
    ).join(" ");
    expect(said).not.toContain("in the air");
    expect(said).toContain("is down");
  });
});
