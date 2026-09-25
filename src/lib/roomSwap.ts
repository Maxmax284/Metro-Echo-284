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
 *
 * The press also calls the station: a "next stop" sign drops in on screen and
 * the room name is spoken aloud, so the swap reads as a deliberate move and
 * not a glitch. Presentation only. Nothing here can block or alter navigation.
 */
import { ROOM_LABEL, isPrimaryRoom, isSurfaceId, roomForSurface } from "./navigation";
import { play, soundOn } from "./streetSound";

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
    announceRoom(nextKey);
    handler?.(nextKey);
  } catch {
    /* Motion is never allowed to break navigation. */
  }
}

let signEl: HTMLDivElement | null = null;
let signTimer: number | null = null;

/**
 * Station call for the destination room: a sign on screen and the name aloud.
 * The sign is one recycled element, appended lazily, so a room change never
 * pays for mounting it.
 */
function announceRoom(nextKey: string): void {
  const room = isPrimaryRoom(nextKey)
    ? nextKey
    : isSurfaceId(nextKey)
      ? roomForSurface(nextKey)
      : null;
  if (!room) return;
  const label = ROOM_LABEL[room];

  if (typeof document !== "undefined") {
    if (!signEl) {
      signEl = document.createElement("div");
      signEl.className = "station-sign";
      signEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(signEl);
    }
    signEl.textContent = `NEXT STOP · ${label.toUpperCase()}`;
    signEl.classList.remove("station-sign--in");
    // Force a reflow so a rapid second tap restarts the drop instead of no-oping.
    void signEl.offsetWidth;
    signEl.classList.add("station-sign--in");
    if (signTimer) window.clearTimeout(signTimer);
    signTimer = window.setTimeout(() => signEl?.classList.remove("station-sign--in"), 950);
  }

  if (!soundOn()) return;
  play("clack");
  try {
    const synth = window.speechSynthesis;
    if (synth) {
      // A new call replaces one still speaking — never a queue of room names.
      synth.cancel();
      const line = new SpeechSynthesisUtterance(label);
      line.rate = 1.05;
      line.pitch = 0.9;
      line.volume = 0.7;
      synth.speak(line);
    }
  } catch {
    /* Speech is a nicety, never a dependency. */
  }
}
