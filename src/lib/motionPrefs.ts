// Room-switch motion preferences — a per-device knob, not account data.
//
// Doctrine:
//  - Local only. This is how *this* device feels, so it lives in localStorage
//    and never round-trips through the backend.
//  - The values drive CSS custom properties on <html>, so the crossfade in
//    index.css reads them without any component re-rendering.
//  - prefers-reduced-motion still wins: the media query in index.css disables
//    the animations regardless of what's set here.
//  - "Feel" is the front door: three honest presets. The sliders are still
//    there for anyone who wants to tune, and tuning marks the feel custom.

const STORE_KEY = "vanta.motion.roomSwap";

/** How expressive the whole app is allowed to be on this device. */
export type Feel = "minimal" | "standard" | "expressive" | "custom";

export type RoomSwapPrefs = {
  /** Crossfade on/off. Off = instant swap, no ghost layer. */
  enabled: boolean;
  /** Incoming fade duration in ms. Outgoing runs at 90% of this. */
  durationMs: number;
  /** Vertical drift of the swap in px. 0 = pure fade, no movement. */
  driftPx: number;
  /** Gap between Ask answer blocks landing, in ms. 0 = all at once. */
  blockStaggerMs: number;
  /** Which preset produced these numbers. */
  feel: Feel;
};

export const ROOM_SWAP_LIMITS = {
  /* A room change is a transit, not a blink. The ceiling is deliberately high
     so "slower than you think" is actually reachable from the Feel sliders. */
  durationMs: { min: 120, max: 900, step: 20 },
  driftPx: { min: 0, max: 20, step: 1 },
  blockStaggerMs: { min: 0, max: 260, step: 10 },
};

/** The three presets. Order is the order they are offered. */
export const FEEL_PRESETS: Record<Exclude<Feel, "custom">, Omit<RoomSwapPrefs, "feel">> = {
  minimal: { enabled: true, durationMs: 200, driftPx: 0, blockStaggerMs: 0 },
  standard: { enabled: true, durationMs: 420, driftPx: 7, blockStaggerMs: 90 },
  expressive: { enabled: true, durationMs: 620, driftPx: 14, blockStaggerMs: 150 },
};

export const FEEL_COPY: Record<Exclude<Feel, "custom">, { label: string; hint: string }> = {
  minimal: { label: "Minimal", hint: "Almost nothing moves. Fastest to read." },
  standard: { label: "Standard", hint: "Rooms glide in and settle." },
  expressive: { label: "Expressive", hint: "Rooms and answers take a long beat to settle." },
};

export const ROOM_SWAP_DEFAULTS: RoomSwapPrefs = { ...FEEL_PRESETS.standard, feel: "standard" };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(raw: unknown, fallback: number, range: { min: number; max: number }) {
  return Number.isFinite(raw as number)
    ? clamp(Math.round(Number(raw)), range.min, range.max)
    : fallback;
}

export function normalizeRoomSwapPrefs(raw: unknown): RoomSwapPrefs {
  const r = (raw ?? {}) as Partial<RoomSwapPrefs>;
  const feel: Feel =
    r.feel === "minimal" || r.feel === "standard" || r.feel === "expressive" || r.feel === "custom"
      ? r.feel
      : ROOM_SWAP_DEFAULTS.feel;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : ROOM_SWAP_DEFAULTS.enabled,
    durationMs: num(r.durationMs, ROOM_SWAP_DEFAULTS.durationMs, ROOM_SWAP_LIMITS.durationMs),
    driftPx: num(r.driftPx, ROOM_SWAP_DEFAULTS.driftPx, ROOM_SWAP_LIMITS.driftPx),
    blockStaggerMs: num(
      r.blockStaggerMs,
      ROOM_SWAP_DEFAULTS.blockStaggerMs,
      ROOM_SWAP_LIMITS.blockStaggerMs,
    ),
    feel,
  };
}

/** Resolve a preset into concrete numbers. Custom keeps whatever is set. */
export function applyFeelPreset(current: RoomSwapPrefs, feel: Feel): RoomSwapPrefs {
  if (feel === "custom") return { ...current, feel: "custom" };
  return { ...FEEL_PRESETS[feel], feel };
}

/** Which preset (if any) a set of numbers matches. Used to keep the UI honest. */
export function detectFeel(prefs: Omit<RoomSwapPrefs, "feel">): Feel {
  for (const key of ["minimal", "standard", "expressive"] as const) {
    const p = FEEL_PRESETS[key];
    if (
      p.enabled === prefs.enabled &&
      p.durationMs === prefs.durationMs &&
      p.driftPx === prefs.driftPx &&
      p.blockStaggerMs === prefs.blockStaggerMs
    ) {
      return key;
    }
  }
  return "custom";
}

/** Timings a previous build wrote for each named preset. A device that chose a
 *  preset chose its meaning, so it follows the preset when the numbers change —
 *  only hand-tuned ("custom") settings keep their own figures. */
const LEGACY_PRESET_DURATIONS: Record<Exclude<Feel, "custom">, number[]> = {
  minimal: [120],
  standard: [200],
  expressive: [300],
};

export function readRoomSwapPrefs(): RoomSwapPrefs {
  if (typeof window === "undefined") return ROOM_SWAP_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return ROOM_SWAP_DEFAULTS;
    const prefs = normalizeRoomSwapPrefs(JSON.parse(raw));
    if (prefs.feel !== "custom" && LEGACY_PRESET_DURATIONS[prefs.feel].includes(prefs.durationMs)) {
      return { ...FEEL_PRESETS[prefs.feel], enabled: prefs.enabled, feel: prefs.feel };
    }
    return prefs;
  } catch {
    return ROOM_SWAP_DEFAULTS;
  }
}

export function writeRoomSwapPrefs(next: RoomSwapPrefs): RoomSwapPrefs {
  const clean = normalizeRoomSwapPrefs(next);
  const withFeel: RoomSwapPrefs = { ...clean, feel: detectFeel(clean) };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(withFeel));
    } catch {
      /* storage blocked — the session still honours the in-memory value */
    }
    applyRoomSwapPrefs(withFeel);
    window.dispatchEvent(new CustomEvent("vanta:room-swap-prefs", { detail: withFeel }));
  }
  return withFeel;
}

/**
 * Push the prefs onto <html> as CSS variables.
 *
 * --feel-k is the honest part: a unitless scale applied to every one-shot
 * motif (arrival, boot, resolve, snap, commit, sheet) so the Feel setting
 * changes what you actually feel during use, not just the room crossfade.
 * 200ms of room swap == k of 1.
 */
export function applyRoomSwapPrefs(prefs: RoomSwapPrefs = readRoomSwapPrefs()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const ms = prefs.enabled ? prefs.durationMs : 0;
  root.style.setProperty("--room-swap-ms", `${ms}ms`);
  root.style.setProperty("--room-swap-out-ms", `${Math.round(ms * 0.9)}ms`);
  root.style.setProperty("--room-swap-drift", `${prefs.enabled ? prefs.driftPx : 0}px`);
  root.style.setProperty("--block-stagger", `${prefs.enabled ? prefs.blockStaggerMs : 0}ms`);
  /* 420ms is the new standard beat, so Standard resolves to k=1 and the
     one-shot motifs (stamps, slips, flaps) keep their calibrated timing. */
  root.style.setProperty("--feel-k", prefs.enabled ? String(Math.round((ms / 420) * 100) / 100) : "0");
  root.dataset.roomSwap = prefs.enabled ? "on" : "off";
  root.dataset.feel = prefs.feel;
}
