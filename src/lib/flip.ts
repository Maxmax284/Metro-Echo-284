import { feelMs } from "@/lib/motion";
// flip — matched-layout travel between a tapped element and the overlay it opens.
//
// Why: a crossfade tells you the screen changed. A matched layout tells you the
// thing you touched *became* the thing you're now looking at. We record the
// rect of whatever the user just pressed, then the overlay animates out of that
// rect instead of fading in from nowhere.
//
// Deliberately tiny: no library, no shared-element registry, transform-only.

type OriginRect = { x: number; y: number; w: number; h: number; at: number };

let lastOrigin: OriginRect | null = null;

/** Freshness window — an origin older than this is stale, so we skip the FLIP. */
const MAX_AGE_MS = 900;

/** A persisted origin has to survive a document load, so it gets more room. */
const PERSIST_MAX_AGE_MS = 2200;

const PERSIST_KEY = "vanta.flip.origin";

function persist(o: OriginRect) {
  try {
    window.sessionStorage.setItem(PERSIST_KEY, JSON.stringify(o));
  } catch {
    /* storage blocked — the in-memory origin still works inside this document */
  }
}

function readPersisted(): OriginRect | null {
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PERSIST_KEY);
    const o = JSON.parse(raw) as OriginRect;
    if (!o || !Number.isFinite(o.at) || !o.w || !o.h) return null;
    if (Date.now() - o.at > PERSIST_MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

/** Call from the tap handler (or onPointerDown) of the element being opened. */
export function markFlipOrigin(el: Element | null | undefined) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  lastOrigin = { x: r.left, y: r.top, w: r.width, h: r.height, at: Date.now() };
  // Persisted too: a card that opens a whole route still gets to travel.
  persist(lastOrigin);
}

/** Record the origin straight from an event's current target. */
export function markFlipOriginFromEvent(e: { currentTarget: unknown }) {
  const t = e.currentTarget as Element | null;
  markFlipOrigin(t ?? null);
}

export function clearFlipOrigin() {
  lastOrigin = null;
  try {
    window.sessionStorage.removeItem(PERSIST_KEY);
  } catch {
    /* noop */
  }
}

/** Consume the pending origin, if it is still fresh. */
export function takeFlipOrigin(): OriginRect | null {
  if (!lastOrigin) {
    const persisted = typeof window === "undefined" ? null : readPersisted();
    return persisted;
  }
  const o = lastOrigin;
  lastOrigin = null;
  try {
    window.sessionStorage.removeItem(PERSIST_KEY);
  } catch {
    /* noop */
  }
  if (Date.now() - o.at > MAX_AGE_MS) return null;
  return o;
}


import { reducedMotion } from "./reducedMotion";

/**
 * Animate `el` as if it grew out of the last-tapped element. Returns a cleanup
 * that cancels the animation. Safe to call with no pending origin — it no-ops.
 */
export function flipFrom(el: HTMLElement | null, durationMs = 300): () => void {
  if (!el) return () => {};
  const origin = takeFlipOrigin();
  if (!origin || reducedMotion()) return () => {};

  const target = el.getBoundingClientRect();
  if (!target.width || !target.height) return () => {};

  const dx = origin.x + origin.w / 2 - (target.left + target.width / 2);
  const dy = origin.y + origin.h / 2 - (target.top + target.height / 2);
  const sx = Math.max(0.2, Math.min(1, origin.w / target.width));
  const sy = Math.max(0.2, Math.min(1, origin.h / target.height));

  const duration = feelMs(durationMs, { min: 0 });
  if (!duration) return () => {};

  /* The element may already own a transform that positions it — a centred
     overlay is translate(-50%, -50%). Animating a bare transform would throw
     that away and leave the panel parked off-screen, so the travel is composed
     on top of the element's own transform and never outlives the animation. */
  let base = "";
  try {
    const computed = getComputedStyle(el).transform;
    if (computed && computed !== "none") base = `${computed} `;
  } catch {
    base = "";
  }

  let anim: Animation | null = null;
  try {
    anim = el.animate(
      [
        { transform: `${base}translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
        { transform: `${base}translate(0px, 0px) scale(1, 1)`, opacity: 1 },
      ],
      { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "none" },
    );
  } catch {
    return () => {};
  }


  return () => {
    try {
      anim?.cancel();
    } catch {
      /* noop */
    }
  };
}
