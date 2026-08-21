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

/** Call from the tap handler (or onPointerDown) of the element being opened. */
export function markFlipOrigin(el: Element | null | undefined) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  lastOrigin = { x: r.left, y: r.top, w: r.width, h: r.height, at: Date.now() };
}

/** Record the origin straight from an event's current target. */
export function markFlipOriginFromEvent(e: { currentTarget: unknown }) {
  const t = e.currentTarget as Element | null;
  markFlipOrigin(t ?? null);
}

export function clearFlipOrigin() {
  lastOrigin = null;
}

/** Consume the pending origin, if it is still fresh. */
export function takeFlipOrigin(): OriginRect | null {
  if (!lastOrigin) return null;
  const o = lastOrigin;
  lastOrigin = null;
  if (Date.now() - o.at > MAX_AGE_MS) return null;
  return o;
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

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

  let anim: Animation | null = null;
  try {
    anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
        { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
      ],
      { duration: durationMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
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
