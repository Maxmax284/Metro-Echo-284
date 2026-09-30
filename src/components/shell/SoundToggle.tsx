// SoundToggle — the street-sound switch, always in reach.
//
// One speaker icon in the top shell: on means clacks, hum, spray and thuds;
// off means silence. This device only — the same switch as Settings → Feel,
// and the two never disagree (SOUND_EVENT keeps them in step).
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOUND_EVENT, setSoundOn, soundOn } from "@/lib/streetSound";

export function SoundToggle() {
  const [on, setOn] = useState(() => soundOn());
  useEffect(() => {
    const sync = () => setOn(soundOn());
    window.addEventListener(SOUND_EVENT, sync);
    return () => window.removeEventListener(SOUND_EVENT, sync);
  }, []);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={on ? "Street sound on — tap for silence" : "Street sound off — tap for sound"}
      title={on ? "Street sound on — tap for silence" : "Street sound off — tap for sound"}
      aria-pressed={on}
      onClick={() => setSoundOn(!on)}
    >
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
    </Button>
  );
}
