// RoomMotionSection — per-device control over the room-switch crossfade.
//
// Doctrine:
//  - Local to this device. Nothing here is account data, nothing is audited.
//  - Honest preview: the sample block below replays the actual keyframes at the
//    current settings, so what you see is what the rooms do.
//  - prefers-reduced-motion still overrides everything; we say so plainly.
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { MoveVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROOM_SWAP_DEFAULTS,
  ROOM_SWAP_LIMITS,
  readRoomSwapPrefs,
  writeRoomSwapPrefs,
  type RoomSwapPrefs,
} from "@/lib/motionPrefs";

export function RoomMotionSection() {
  const [prefs, setPrefs] = useState<RoomSwapPrefs>(() => readRoomSwapPrefs());
  const [replayKey, setReplayKey] = useState(0);
  const reduced =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  const commit = (next: Partial<RoomSwapPrefs>) => {
    const saved = writeRoomSwapPrefs({ ...prefs, ...next });
    setPrefs(saved);
  };

  // Replay the sample whenever a value changes so the change is felt, not read.
  useEffect(() => {
    setReplayKey((k) => k + 1);
  }, [prefs.enabled, prefs.durationMs, prefs.driftPx]);

  const isDefault =
    prefs.enabled === ROOM_SWAP_DEFAULTS.enabled &&
    prefs.durationMs === ROOM_SWAP_DEFAULTS.durationMs &&
    prefs.driftPx === ROOM_SWAP_DEFAULTS.driftPx;

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MoveVertical className="h-4 w-4 text-muted-foreground" />
            Room switching
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            How Today, Work, Ask and Receipts hand over to each other. This device only.
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          onCheckedChange={(v) => commit({ enabled: v })}
          aria-label="Crossfade between rooms"
        />
      </div>

      <div className={cn("mt-4 space-y-5", !prefs.enabled && "pointer-events-none opacity-40")}>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-[13px] font-medium">Crossfade length</label>
            <span className="font-mono text-[12px] text-muted-foreground">{prefs.durationMs}ms</span>
          </div>
          <Slider
            className="mt-2"
            value={[prefs.durationMs]}
            min={ROOM_SWAP_LIMITS.durationMs.min}
            max={ROOM_SWAP_LIMITS.durationMs.max}
            step={ROOM_SWAP_LIMITS.durationMs.step}
            onValueChange={([v]) => commit({ durationMs: v })}
            aria-label="Crossfade length in milliseconds"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Short feels snappy. Long feels cinematic and slows down fast switching.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-[13px] font-medium">Drift</label>
            <span className="font-mono text-[12px] text-muted-foreground">{prefs.driftPx}px</span>
          </div>
          <Slider
            className="mt-2"
            value={[prefs.driftPx]}
            min={ROOM_SWAP_LIMITS.driftPx.min}
            max={ROOM_SWAP_LIMITS.driftPx.max}
            step={ROOM_SWAP_LIMITS.driftPx.step}
            onValueChange={([v]) => commit({ driftPx: v })}
            aria-label="Drift distance in pixels"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            How far the incoming room lifts. Zero is a pure fade with no movement.
          </p>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-border/60">
            <div key={replayKey} className="motion-surface-in bg-muted/30 p-3">
              <div className="h-2 w-24 rounded bg-foreground/20" />
              <div className="mt-2 h-2 w-40 rounded bg-foreground/10" />
              <div className="mt-2 h-2 w-32 rounded bg-foreground/10" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {reduced
            ? "Your system asks for reduced motion, so rooms swap instantly no matter what's set here."
            : "If your system asks for reduced motion, rooms swap instantly regardless of these settings."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={isDefault}
          onClick={() => setPrefs(writeRoomSwapPrefs(ROOM_SWAP_DEFAULTS))}
        >
          Reset
        </Button>
      </div>
    </section>
  );
}
