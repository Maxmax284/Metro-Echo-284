// useLongPress — press-and-hold on touch without hijacking a normal tap.
//
// Doctrine: a long press is only ever allowed to *reveal* something. It never
// executes and never navigates. The one hard requirement is that a hold must
// not also fire the tile's tap action, so the hook hands back a `shouldSuppressClick`
// gate the tap handler checks before it does anything.
import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 450;
/** A hold that drifts more than this is a scroll, not a press. */
const MOVE_TOLERANCE_PX = 10;

export function useLongPress(
  onLongPress: () => void,
  opts?: { ms?: number; disabled?: boolean },
) {
  const ms = opts?.ms ?? HOLD_MS;
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(
    (e: React.PointerEvent) => {
      /* Mouse and keyboard users already have the visible "?" control. */
      if (opts?.disabled || e.pointerType === "mouse") return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, ms);
    },
    [clear, ms, onLongPress, opts?.disabled],
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      const o = origin.current;
      if (!o) return;
      if (Math.abs(e.clientX - o.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - o.y) > MOVE_TOLERANCE_PX) {
        clear();
      }
    },
    [clear],
  );

  /**
   * Call this first inside the element's onClick. Returns true when the click is
   * the tail of a long press and must be ignored — the panel is already open.
   */
  const shouldSuppressClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return {
    shouldSuppressClick,
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      /* A hold on touch otherwise raises the OS text/callout menu. */
      onContextMenu: (e: React.MouseEvent) => {
        if (fired.current) e.preventDefault();
      },
    },
  };
}
