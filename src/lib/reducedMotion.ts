// reducedMotion — the one shared read of the person's motion preference.
//
// Six files used to carry their own copy of this check, and every new
// animation had to remember to carry a seventh. One helper now; the global
// CSS kill-switch in index.css is the belt to these suspenders.
export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
