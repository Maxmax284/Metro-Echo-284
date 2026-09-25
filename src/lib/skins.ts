import { play } from "@/lib/streetSound";
// Skins — the background is a surface, not wallpaper.
//
// Doctrine:
//  - One ambient layer for the whole app. Skins change its texture, never its
//    information. Nothing here carries meaning the words don't already carry.
//  - Weather still tints on top: `data-skin` and `data-weather` are independent
//    attributes on <html>, and every visual consequence lives in index.css.
//  - Per-device, like room-swap motion. This is how *this* screen feels.
//  - Reduced motion and the Minimal feel preset both win over anything here.

export type SkinId = "substation" | "blueprint" | "neon-rain" | "concrete" | "circuit";

export const SKINS: { id: SkinId; label: string; hint: string }[] = [
  { id: "substation", label: "Substation", hint: "The house rig. Cyan wash, clean and quiet." },
  { id: "blueprint", label: "Blueprint", hint: "Drafting grid and registration ticks. Reads engineered." },
  { id: "neon-rain", label: "Neon Rain", hint: "Drifting light streaks and wet-asphalt sheen." },
  { id: "concrete", label: "Concrete", hint: "Heavy grain, no glow, one sodium-lamp wash." },
  { id: "circuit", label: "Circuit", hint: "Faint trace paths that pulse when data lands." },
];

export const DEFAULT_SKIN: SkinId = "substation";

const SKIN_KEY = "vanta.skin";
const AMBIENT_KEY = "vanta.skin.ambient";

export function normalizeSkin(raw: unknown): SkinId {
  return SKINS.some((s) => s.id === raw) ? (raw as SkinId) : DEFAULT_SKIN;
}

export function readSkin(): SkinId {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  try {
    return normalizeSkin(window.localStorage.getItem(SKIN_KEY));
  } catch {
    return DEFAULT_SKIN;
  }
}

export function writeSkin(next: SkinId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SKIN_KEY, next);
  } catch {
    /* private mode — the skin just won't persist */
  }
  applySkin(next);
}

/** Ambient layers on/off. Off keeps the plain wash and kills every moving layer. */
export function readAmbient(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AMBIENT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeAmbient(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AMBIENT_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  applyAmbient(on);
}

export function applySkin(skin: SkinId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-skin", skin);
}

export function applyAmbient(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-ambient", on ? "on" : "off");
}

/** Call once before first paint so the background never flashes the default. */
export function applySkinPrefs(): void {
  applySkin(readSkin());
  applyAmbient(readAmbient());
}

/**
 * The room owns a position in the world. Switching rooms moves the background
 * rather than swapping it, so the app feels like one place with four corners.
 */
export function setRoom(room: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prev = root.getAttribute("data-room");
  if (prev === room) return;
  root.setAttribute("data-room", room);
  /* Today's light follows the clock: position and colour, re-read on arrival. */
  applyDaylight();
  // Turnstile click on a real room change; zippo when Ask opens. Opt-in only.
  if (prev) play(room === "ask" ? "zippo" : "turnstile");
  // Dawn shutter: first Today of the local day, once per device.
  if (room === "today") {
    try {
      const day = new Date().toDateString();
      if (localStorage.getItem("vanta.shutter.day") !== day) {
        localStorage.setItem("vanta.shutter.day", day);
        root.setAttribute("data-shutter", "lift");
        window.setTimeout(() => root.removeAttribute("data-shutter"), 1200);
      }
    } catch {
      /* storage blocked — skip the lift */
    }
  }
}

/**
 * Nav press throws a light line across the background from the tapped point.
 * One shot, then it's gone — the backdrop listens for this event.
 */
export const THROW_EVENT = "vanta:throw";

export function throwFrom(x: number, y: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(THROW_EVENT, { detail: { x, y } }));
}
