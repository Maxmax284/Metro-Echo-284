// TypeOnLine — the lead line of a read writes itself on, once.
//
// Doctrine: motion communicates state, it does not decorate. A read that is new
// to this session types on so it reads as Echo speaking; a read that is merely
// refetched appears instantly. Nothing loops, nothing re-types on re-render,
// and with motion turned down the text is simply there.
import { useEffect, useRef, useState } from "react";
import { feelK } from "@/lib/motion";
import { play } from "@/lib/streetSound";
import { cn } from "@/lib/utils";

/* Teletype cadence: a strike you can actually read, not a blur. A number gets a
   held beat after it lands so a count carries weight. */
const CHAR_MS = 38;
const MAX_MS = 2600;
const NUMBER_HOLD_MS = 120;

function motionOff(): boolean {
  if (typeof window === "undefined") return true;
  if (feelK() === 0) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function TypeOnLine({
  text,
  className,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  as?: "span" | "p" | "h1" | "h2";
}) {
  /* One latch per distinct text: the same words never type twice. */
  const typed = useRef<Set<string>>(new Set());
  const [shown, setShown] = useState(text);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    if (!text) {
      setShown("");
      setWriting(false);
      return;
    }
    if (typed.current.has(text) || motionOff()) {
      typed.current.add(text);
      setShown(text);
      setWriting(false);
      return;
    }
    typed.current.add(text);
    const step = Math.max(6, Math.min(CHAR_MS / (feelK() || 1), MAX_MS / text.length));
    let i = 0;
    setShown("");
    setWriting(true);
    const timer = window.setInterval(() => {
      i += Math.max(1, Math.round(text.length / (MAX_MS / step)));
      if (i >= text.length) {
        setShown(text);
        setWriting(false);
        window.clearInterval(timer);
        return;
      }
      setShown(text.slice(0, i));
    }, step);
    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <Tag className={cn(writing && "vanta-typing", className)} aria-label={text}>
      <span aria-hidden={writing || undefined}>{shown}</span>
    </Tag>
  );
}
