/**
 * Room swap handoff seam.
 *
 * The room shell needs to know a swap is coming *before* React starts rendering
 * the incoming room, because rendering a room is expensive enough to block the
 * main thread for a couple of hundred milliseconds. If the outgoing room only
 * starts moving after that render, the whole transition is swallowed by the
 * stall and the swap reads as an instant snap.
 *
 * So the nav announces the destination on press, the shell photographs the
 * outgoing room and starts it sliding on the compositor, and only then does the
 * room state actually change. The slide keeps running through the stall.
 * Presentation only. Nothing here can block or alter navigation.
 */

type BeginRoomSwap = (nextKey: string) => void;

let handler: BeginRoomSwap | null = null;

/** The room shell claims the seam. Returns an unregister function. */
export function registerRoomSwap(fn: BeginRoomSwap): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Announce an imminent room change. Safe to call when nothing is listening. */
export function beginRoomSwap(nextKey: string): void {
  try {
    handler?.(nextKey);
  } catch {
    /* Motion is never allowed to break navigation. */
  }
}
