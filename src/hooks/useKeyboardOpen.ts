// useKeyboardOpen — is the software keyboard up right now?
//
// Two honest signals, both required:
//   1. An editable element owns focus. The keyboard exists because of it, so
//      when nothing editable is focused there is no keyboard to speak of.
//   2. The viewport lost a real bite of height. Browser chrome comes and goes
//      in ~60px; the keys take 250+. We measure against the tallest the
//      viewport has been this session, so it still works with
//      interactive-widget=resizes-content, where window.innerHeight and the
//      visual viewport shrink together and a simple diff stays near zero.
//
// Either signal clearing brings the chrome back: dismiss the keys with the
// back button and the nav returns even if the field still has focus.
import { useEffect, useState } from "react";

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let tallest = Math.max(window.innerHeight, window.visualViewport?.height ?? 0);
    let editing = isEditable(document.activeElement);

    const measure = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      tallest = Math.max(tallest, h);
      setOpen(editing && tallest - h > 100);
    };
    const onFocusIn = (e: FocusEvent) => {
      editing = isEditable(e.target as Element | null);
      measure();
    };
    const onFocusOut = () => {
      editing = false;
      measure();
    };

    measure();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      vv?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return open;
}
