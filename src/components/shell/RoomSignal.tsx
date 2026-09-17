import { cn } from "@/lib/utils";
import type { RoomSignal as Signal } from "@/lib/roomSignals";

const TONE = {
  context: "bg-primary shadow-[0_0_7px_hsl(var(--primary)/0.55)]",
  attention: "bg-warn shadow-[0_0_7px_hsl(var(--warn)/0.55)]",
  critical: "bg-destructive shadow-[0_0_7px_hsl(var(--destructive)/0.55)]",
  complete: "bg-signal shadow-[0_0_7px_hsl(var(--signal)/0.45)]",
} as const;

export function RoomSignal({ signal }: { signal: Signal }) {
  return (
    <span
      aria-hidden
      className={cn(
        "vanta-room-led absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
        TONE[signal.tone],
        signal.fresh && `vanta-room-led-${signal.tone}`,
      )}
    />
  );
}