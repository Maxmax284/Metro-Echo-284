// RoomMotionSection — per-device control over how much Echo moves.
//
// Doctrine:
//  - Local to this device. Nothing here is account data, nothing is audited.
//  - Feel presets are the front door: Minimal / Standard / Expressive. The
//    sliders stay for tuning, and tuning honestly reports itself as Custom.
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
  FEEL_COPY,
  ROOM_SWAP_DEFAULTS,
  ROOM_SWAP_LIMITS,
  applyFeelPreset,
  readRoomSwapPrefs,
  writeRoomSwapPrefs,
  type Feel,
  type RoomSwapPrefs,
} from "@/lib/motionPrefs";
import { setSoundOn, soundOn } from "@/lib/streetSound";

const PRESETS: Exclude<Feel, "custom">[] = ["minimal", "standard", "expressive"];

export function RoomMotionSection() {
  const [prefs, setPrefs] = useState<RoomSwapPrefs>(() => readRoomSwapPrefs());
  const [replayKey, setReplayKey] = useState(0);
  const [sound, setSound] = useState(() => soundOn());
  const reduced =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  const commit = (next: Partial<RoomSwapPrefs>) => {
    const saved = writeRoomSwapPrefs({ ...prefs, ...next });
    setPrefs(saved);
  };

  const choosePreset = (feel: Exclude<Feel, "custom">) => {
    setPrefs(writeRoomSwapPrefs(applyFeelPreset(prefs, feel)));
  };

  // Replay the sample whenever a value changes so the change is felt, not read.
  useEffect(() => {
    setReplayKey((k) => k + 1);
  }, [prefs.enabled, prefs.durationMs, prefs.driftPx, prefs.blockStaggerMs]);

  const isDefault =
    prefs.enabled === ROOM_SWAP_DEFAULTS.enabled &&
    prefs.durationMs === ROOM_SWAP_DEFAULTS.durationMs &&
    prefs.driftPx === ROOM_SWAP_DEFAULTS.driftPx &&
    prefs.blockStaggerMs === ROOM_SWAP_DEFAULTS.blockStaggerMs;

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MoveVertical className="h-4 w-4 text-muted-foreground" />
            Feel
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            How much Echo moves when rooms hand over and answers arrive. This device only.
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          onCheckedChange={(v) => commit({ enabled: v })}
          aria-label="Movement on this device"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Feel preset">
        {PRESETS.map((f) => {
          const active = prefs.feel === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => choosePreset(f)}
              aria-pressed={active}
              className={cn(
                "rounded-lg px-2 py-2 text-left ring-1 transition-colors",
                active
                  ? "bg-primary/10 ring-primary/40"
                  : "bg-muted/20 ring-border/60 hover:bg-muted/40",
              )}
            >
              <span className={cn("block text-[12px] font-medium", active && "text-primary")}>
                {FEEL_COPY[f].label}
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                {FEEL_COPY[f].hint}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-muted/20 p-3 ring-1 ring-border/60">
        <div>
          <p className="text-[12px] font-medium">Street sound</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Board clacks, spray hiss on capture, a thud when a receipt lands. On by default — switch it off for silence.
          </p>
        </div>
        <Switch
          checked={sound}
          onCheckedChange={(v) => {
            setSoundOn(v);
            setSound(v);
          }}
          aria-label="Street sound on this device"
        />
      </div>
      {prefs.feel === "custom" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Custom — you've tuned this by hand. Pick a preset above to go back.
        </p>
      ) : null}


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
          <div className="flex items-baseline justify-between">
            <label className="text-[13px] font-medium">Answer landing</label>
            <span className="font-mono text-[12px] text-muted-foreground">
              {prefs.blockStaggerMs}ms
            </span>
          </div>
          <Slider
            className="mt-2"
            value={[prefs.blockStaggerMs]}
            min={ROOM_SWAP_LIMITS.blockStaggerMs.min}
            max={ROOM_SWAP_LIMITS.blockStaggerMs.max}
            step={ROOM_SWAP_LIMITS.blockStaggerMs.step}
            onValueChange={([v]) => commit({ blockStaggerMs: v })}
            aria-label="Gap between answer blocks landing, in milliseconds"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Gap between the parts of an Ask answer settling into place. Zero shows the whole answer
            at once.
          </p>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-border/60">
            <div key={replayKey} className="motion-surface-in bg-muted/30 p-3">
              <div className="h-2 w-24 rounded bg-foreground/20" />
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="vanta-block-in mt-2 h-2 rounded bg-foreground/10"
                  style={{ ["--block-i" as string]: String(i), width: `${10 - i * 2}rem` }}
                />
              ))}
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
