// deskTransit — the handoff between Work and a specialist desk.
//
// Doctrine:
//   - It reports a move that is really happening. It is raised by the tap that
//     navigates, never on a timer and never to fake progress.
//   - It covers the render stall of the incoming desk so you never see a bare
//     black frame, and it names the desk you are being handed to.
//   - It changes nothing. Presentation only.

export const DESK_TRANSIT_EVENT = "vanta:desk-transit";

export type DeskTransit = {
  /** Short destination word for the drum, e.g. "FLIGHTS". */
  word: string;
  /** One plain line about what that desk owns. */
  line?: string;
  /** How long the cover holds. Kept short — it is a handoff, not a loader. */
  holdMs?: number;
};

/** Raise the transfer cover. Call it in the same tap that navigates. */
export function beginDeskTransit(t: DeskTransit): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DeskTransit>(DESK_TRANSIT_EVENT, { detail: t }));
}

export function onDeskTransit(fn: (t: DeskTransit) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => fn((e as CustomEvent<DeskTransit>).detail);
  window.addEventListener(DESK_TRANSIT_EVENT, h);
  return () => window.removeEventListener(DESK_TRANSIT_EVENT, h);
}
