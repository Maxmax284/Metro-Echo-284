// groundStage — the one thing only the traveller knows: where they are standing.
//
// Doctrine:
//   - It lives on this device and nowhere else. No table, no receipt, no event:
//     it changes emphasis, never a fact, so it is not truth worth keeping.
//   - Three states and a way back out of all of them. One tap each.
//   - It never moves itself. A flight that has gone clears it, because standing
//     in yesterday's terminal is not a state anyone is in.

export type GroundStage = "away" | "airport" | "security";

export const STAGE_LABEL: Record<Exclude<GroundStage, "away">, string> = {
  airport: "Confirm I'm at the airport",
  security: "Confirm I'm through security",
};

/** What the tap changed, said back once so it is not a button with no effect. */
export const STAGE_DONE: Record<Exclude<GroundStage, "away">, string> = {
  airport: "You're at the airport. Check-in comes first.",
  security: "You're airside. Echo re-reads the airline every few minutes for a gate — it has no feed from the terminal board, so the board there still gets there first.",
};

const KEY = "vanta.ground.stage";

export function readStage(planId: string): GroundStage {
  try {
    const v = localStorage.getItem(`${KEY}.${planId}`);
    return v === "airport" || v === "security" ? v : "away";
  } catch {
    return "away";
  }
}

export function writeStage(planId: string, stage: GroundStage) {
  try {
    if (stage === "away") localStorage.removeItem(`${KEY}.${planId}`);
    else localStorage.setItem(`${KEY}.${planId}`, stage);
  } catch {
    /* A blocked store is not a reason to break the card. */
  }
}

/** The next tap offered, or null when there is nothing further to say. */
export function nextStage(stage: GroundStage): Exclude<GroundStage, "away"> | null {
  if (stage === "away") return "airport";
  if (stage === "airport") return "security";
  return null;
}
