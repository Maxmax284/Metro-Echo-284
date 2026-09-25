// flick — cards carry weight when you throw a list.
//
// One capture-phase scroll listener for the whole app. It measures how fast the
// scroller is moving, writes that as --flick (−1..1) on the scrolling element,
// and decays it back to rest. CSS decides what to do with it; nothing else here
// touches layout, data or React.
//
// Reduced motion: the listener is never installed, so --flick stays unset and
// every card sits still.

const MAX_V = 46; // px per frame that counts as a full-strength flick
const DECAY = 0.86;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function startFlickInertia(): () => void {
  if (typeof window === "undefined" || reducedMotion()) return () => undefined;

  const lastTop = new WeakMap<Element, number>();
  const level = new Map<HTMLElement, number>();
  let frame = 0;

  const tick = () => {
    frame = 0;
    let alive = false;
    level.forEach((v, el) => {
      const next = Math.abs(v) < 0.02 ? 0 : v * DECAY;
      level.set(el, next);
      el.style.setProperty("--flick", next.toFixed(3));
      if (next === 0) {
        el.style.removeProperty("--flick");
        level.delete(el);
      } else alive = true;
    });
    if (alive) frame = window.requestAnimationFrame(tick);
  };

  const onScroll = (e: Event) => {
    /* The page itself scrolls as the document; a room scroller as an element. */
    const raw = e.target;
    const el =
      raw instanceof HTMLElement
        ? raw
        : raw === document || raw === window
          ? document.documentElement
          : null;
    if (!el) return;
    const top = el.scrollTop;
    const prev = lastTop.get(el);
    lastTop.set(el, top);
    if (prev === undefined) return;
    const v = Math.max(-1, Math.min(1, (top - prev) / MAX_V));
    if (Math.abs(v) < 0.04) return;
    level.set(el, v);
    if (!frame) frame = window.requestAnimationFrame(tick);
  };

  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
    if (frame) window.cancelAnimationFrame(frame);
    level.forEach((_, el) => el.style.removeProperty("--flick"));
    level.clear();
  };
}
