// The chrome's read of what kind of moment this is.
//
// This used to be a second, private state machine that guessed at "capturing /
// planning / executing" from the room name and a click counter. It now derives
// from the ONE canonical posture model (`Posture` in the shared awareness
// context), so the glyph in the header and the suppression rules in the
// awareness pipeline can never disagree about what is going on.
//
// Nothing here infers a posture. It reads the posture the person set (or that a
// session set deliberately) and picks a visual register for it.
import type { Posture } from "@/lib/awarenessContext";
import { useVantaContext } from "@/providers/VantaContextProvider";

/** The visual register only. Not a state, not a mood — a way of drawing. */
export type OperationalState = "capturing" | "planning" | "executing" | "moving" | "ambient";

/** Rooms where the person is actively putting something in or acting on it. */
const ROOM_REGISTER: Record<string, OperationalState> = {
  memory: "planning",
  actions: "executing",
  capture: "capturing",
};

/**
 * One posture, one register. A walk reads as movement; a serious moment reads
 * as calm rather than busy, because urgency in the chrome is not help.
 */
export function registerFor(posture: Posture | null | undefined, surface: string): OperationalState {
  switch (posture) {
    case "walk_with_me":
    case "moving":
    case "travel":
    case "driving":
      return "moving";
    case "high_stakes":
    case "quiet":
    case "sleep":
      return "ambient";
    case "deep_work":
      return "planning";
    default:
      return ROOM_REGISTER[surface] ?? "ambient";
  }
}

/**
 * Kept as a hook with the old name so the shell did not need rewiring, but it
 * no longer holds any state of its own. `registerInput` remains a no-op on
 * purpose: input counting was never a real signal about anything.
 */
export function useOperationalState(surface: string) {
  const { context } = useVantaContext();
  return {
    state: registerFor(context.posture ?? null, surface),
    registerInput: () => {},
  };
}
