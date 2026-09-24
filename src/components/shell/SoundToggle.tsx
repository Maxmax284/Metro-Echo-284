// SoundToggle — the visible street-sound switch in the top bar. Device only.
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { SOUND_EVENT, setSoundOn, soundOn } from "@/lib/streetSound";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(() => soundOn());
  useEffect(() => {
    const sync = () => setOn(soundOn());
    window.addEventListener(SOUND_EVENT, sync);
    return () => window.removeEventListener(SOUND_EVENT, sync);
  }, []);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Street sound on — tap to mute" : "Street sound off — tap to turn on"}
      title={on ? "Street sound on" : "Street sound off"}
      onClick={() => setSoundOn(!on)}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 transition-colors",
        on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-elevated/60",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
