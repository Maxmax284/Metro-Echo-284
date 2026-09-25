import { useEffect, useState } from "react";
import {
  MessageSquare,
  Receipt,
  Sun,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS, MOTION_MICRO, MOTION_ROW } from "@/lib/motion";

import { PRIMARY_ROOMS, roomForSurface, type SurfaceId } from "@/lib/navigation";
import { setRoom, throwFrom } from "@/lib/skins";
import { beginRoomSwap } from "@/lib/roomSwap";
import { RoomSignal } from "@/components/shell/RoomSignal";
import type { RoomKey } from "@/lib/navigation";
import type { RoomSignal as RoomSignalState } from "@/lib/roomSignals";

export type SurfaceKey = SurfaceId;

const items: { key: SurfaceKey; label: string; Icon: typeof MessageSquare }[] = [
  // Primary rooms
  { key: "today", label: "Today", Icon: Sun },
  { key: "work", label: "Work", Icon: Briefcase },
  { key: "ask", label: "Ask", Icon: Sparkles },
  { key: "receipts", label: "Receipts", Icon: Receipt },
];

export function SurfaceTabs({
  active,
  onChange,
  variant = "rail",
  signals = {},
  bubble = null,
  onDismissBubble,
  onOpenSignal,
}: {
  active: SurfaceKey;
  onChange: (k: SurfaceKey) => void;
  variant?: "rail" | "bottom";
  signals?: Partial<Record<RoomKey, RoomSignalState>>;
  bubble?: { room: RoomKey; text: string } | null;
  onDismissBubble?: () => void;
  onOpenSignal?: (signal: RoomSignalState) => void;
}) {
  const primaryItems = PRIMARY_ROOMS.map((k) => items.find((i) => i.key === k)).filter((i): i is (typeof items)[number] => Boolean(i));
  const activeRoom = roomForSurface(active);

  // The world has four corners: tell the backdrop which room we are in so the
  // ambient wash moves with navigation instead of being swapped out.
  useEffect(() => {
    setRoom(activeRoom);
  }, [activeRoom]);

  /* A nav press throws a light line across the background from where you
     tapped, so the change of room registers physically before it registers
     visually. Presentation only — navigation itself is unchanged. */
  const go = (key: SurfaceKey, e: { clientX: number; clientY: number }) => {
    throwFrom(e.clientX, e.clientY);
    const signal = signals[key as RoomKey];
    if (signal?.href) {
      onOpenSignal?.(signal);
      window.location.assign(signal.href);
      return;
    }
    const target = signal?.target ?? key;
    /* Tell the shell where we are going before the room state changes. Building
       a room blocks the main thread long enough to swallow the whole transition,
       so the outgoing room has to be photographed and set moving first, then
       handed over a frame later. */
    beginRoomSwap(target);
    requestAnimationFrame(() => onChange(target));
    if (signal?.situationId) {
      window.setTimeout(() => document.getElementById(
        signal.target === "actions" ? `action-${signal.situationId}` :
        signal.target === "receipts" ? `receipt-${signal.situationId}` :
        signal.room === "ask" ? "ask-environment-edge" : `situation-${signal.situationId}`,
      )?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
    if (bubble?.room === key) onDismissBubble?.();
    if (signal) onOpenSignal?.(signal);
  };

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Primary"
        className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/60 px-2 pt-1.5 md:hidden"
      >
        {primaryItems.map(({ key, label, Icon }) => {
          const isActive = activeRoom === key;
          /* Ask is the intelligence room, so it marks in accent purple. The
             operational rooms stay cyan. Colour keeps meaning that way. */
          const tone = key === "ask" ? "accent" : "primary";
          return (
            <button
              key={key}
              onClick={(e) => go(key, e)}
              className={cn(
                "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[11px]",
                MOTION_ROW,
                MOTION_FOCUS,
                tone === "accent" && "vanta-focus-accent",
                isActive
                  ? tone === "accent" ? "text-accent" : "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}

                aria-label={signals[key as RoomKey] ? `${label}: ${signals[key as RoomKey]?.label}` : label}
              aria-current={isActive ? "page" : undefined}
            >
              {signals[key as RoomKey] && <RoomSignal signal={signals[key as RoomKey] as RoomSignalState} />}
              {bubble?.room === key && (
                <span className="vanta-discovery-bubble absolute bottom-[calc(100%+4.5rem)] right-0 z-10 w-56 px-3 py-2 text-left text-[11px] leading-snug text-foreground" role="status">
                  {bubble.text}
                </span>
              )}
              {/* Machined marker: square-cut 2px bar, not a soft pill. */}
              <span
                /* Keyed on the active room so the marker cuts in from its own
                   centre each time you change rooms — the eye follows it. */
                key={isActive ? `on-${activeRoom}` : "off"}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-0.5 left-1/2 h-[2px] -translate-x-1/2 rounded-[1px] transition-[width,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
                  tone === "accent" ? "bg-accent" : "bg-primary",
                  isActive ? "w-7 opacity-100 vanta-marker-h" : "w-0 opacity-0",
                )}
              />
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
                  isActive && "-translate-y-0.5",
                  isActive && (tone === "accent"
                    ? "drop-shadow-[0_0_10px_hsl(var(--accent)/0.55)]"
                    : "drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]"),
                )}
              />
              <span className="tracking-[0.02em]">{label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="hidden md:flex md:w-16 md:flex-col md:items-center md:gap-2 md:py-4">
      {primaryItems.map(({ key, label, Icon }) => {
        const isActive = activeRoom === key;
        const accent = key === "ask";
        return (
          <button
            key={key}
            onClick={(e) => go(key, e)}
            title={label}
            aria-label={signals[key as RoomKey] ? `${label}: ${signals[key as RoomKey]?.label}` : label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex h-11 w-11 flex-col items-center justify-center rounded-lg",
              MOTION_MICRO,
              MOTION_FOCUS,
              accent && "vanta-focus-accent",
              isActive
                ? accent ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            )}

          >
            {signals[key as RoomKey] && <RoomSignal signal={signals[key as RoomKey] as RoomSignalState} />}
            {bubble?.room === key && (
              <span className="vanta-discovery-bubble absolute left-[calc(100%+8px)] top-1/2 z-40 w-56 -translate-y-1/2 px-3 py-2 text-left text-[11px] leading-snug text-foreground" role="status">
                {bubble.text}
              </span>
            )}
            <Icon className="h-5 w-5" />
            <span className="text-[9px] leading-tight tracking-[0.02em]">{label}</span>
            {isActive && (
              <span
                key={`rail-${activeRoom}`}
                aria-hidden
                className={cn(
                  "absolute -left-0.5 h-6 w-[2px] rounded-r-[1px] vanta-marker-v",
                  accent ? "bg-accent" : "bg-primary",
                )}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
