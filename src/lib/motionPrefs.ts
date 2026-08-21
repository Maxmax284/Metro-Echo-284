// Room-switch motion preferences — a per-device knob, not account data.
//
// Doctrine:
//  - Local only. This is how *this* device feels, so it lives in localStorage
//    and never round-trips through the backend.
//  - The values drive CSS custom properties on <html>, so the crossfade in
//    index.css reads them without any component re-rendering.
//  - prefers-reduced-motion still wins: the media query in index.css disables
//    the animations regardless of what's set here.

const STORE_KEY = "vanta.motion.roomSwap";

export type RoomSwapPrefs = {
  /** Crossfade on/off. Off = instant swap, no ghost layer. */
  enabled: boolean;
  /** Incoming fade duration in ms. Outgoing runs at 90% of this. */
  durationMs: number;
  /** Vertical drift of the swap in px. 0 = pure fade, no movement. */
  driftPx: number;
};

export const ROOM_SWAP_DEFAULTS: RoomSwapPrefs = {
  enabled: true,
  durationMs: 200,
  driftPx: 4,
};

export const ROOM_SWAP_LIMITS = {
  durationMs: { min: 80, max: 420, step: 20 },
  driftPx: { min: 0, max: 12, step: 1 },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeRoomSwapPrefs(raw: unknown): RoomSwapPrefs {
  const r = (raw ?? {}) as Partial<RoomSwapPrefs>;
  const d = ROOM_SWAP_LIMITS.durationMs;
  const p = ROOM_SWAP_LIMITS.driftPx;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : ROOM_SWAP_DEFAULTS.enabled,
    durationMs: Number.isFinite(r.durationMs)
      ? clamp(Math.round(Number(r.durationMs)), d.min, d.max)
      : ROOM_SWAP_DEFAULTS.durationMs,
    driftPx: Number.isFinite(r.driftPx)
      ? clamp(Math.round(Number(r.driftPx)), p.min, p.max)
      : ROOM_SWAP_DEFAULTS.driftPx,
  };
}

export function readRoomSwapPrefs(): RoomSwapPrefs {
  if (typeof window === "undefined") return ROOM_SWAP_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return ROOM_SWAP_DEFAULTS;
    return normalizeRoomSwapPrefs(JSON.parse(raw));
  } catch {
    return ROOM_SWAP_DEFAULTS;
  }
}

export function writeRoomSwapPrefs(next: RoomSwapPrefs): RoomSwapPrefs {
  const clean = normalizeRoomSwapPrefs(next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(clean));
    } catch {
      /* storage blocked — the session still honours the in-memory value */
    }
    applyRoomSwapPrefs(clean);
    window.dispatchEvent(new CustomEvent("vanta:room-swap-prefs", { detail: clean }));
  }
  return clean;
}

/** Push the prefs onto <html> as CSS variables the crossfade reads. */
export function applyRoomSwapPrefs(prefs: RoomSwapPrefs = readRoomSwapPrefs()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const ms = prefs.enabled ? prefs.durationMs : 0;
  root.style.setProperty("--room-swap-ms", `${ms}ms`);
  root.style.setProperty("--room-swap-out-ms", `${Math.round(ms * 0.9)}ms`);
  root.style.setProperty("--room-swap-drift", `${prefs.enabled ? prefs.driftPx : 0}px`);
  root.dataset.roomSwap = prefs.enabled ? "on" : "off";
}
