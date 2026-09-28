// OccasionsSection — the opt-in for kept cultural moments at the boot.
//
// Off is the default. On means: when the place you are standing in has a
// kept occasion today, the morning boot stamps it over the place drum. Dates
// are fixed civil dates, weekday rules, or astronomy computed on this device
// — nothing is fetched, and a place with no kept occasion is left alone.
// The switch is per device (like the temperature unit) because the boot must
// read it the instant the app opens, before anything can load.
import { useState } from "react";
import { Stamp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { play } from "@/lib/streetSound";
import { OCCASIONS, OCCASIONS_KEY, type OccasionTone } from "@/lib/occasions";

const TONE_WORD: Record<OccasionTone, string> = {
  celebration: "red ink",
  observance: "station ink",
  remembrance: "quiet grey",
};

function readOn(): boolean {
  try {
    return localStorage.getItem(OCCASIONS_KEY) === "1";
  } catch {
    return false;
  }
}

export function OccasionsSection() {
  const [on, setOn] = useState(readOn);

  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(OCCASIONS_KEY, v ? "1" : "0");
    } catch {
      /* a private window still honours the toggle for this session */
    }
    if (v) play("stamp", { gain: 0.4 });
  };

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Stamp className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Occasions at the boot</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              When you're standing somewhere with a kept day — Songkran, Carnival, a quiet Memorial
              Day — the morning boot stamps it over the place name, and the day holds a small decal
              on Today until its window passes. Dates come from the calendar and the moon, computed
              on this device. Nothing is fetched, and off means off.
            </p>
          </div>
        </div>
        <Switch checked={on} onCheckedChange={set} aria-label="Occasions at the boot" />
      </div>

      {on && (
        <ul className="mt-3 space-y-1.5">
          {OCCASIONS.map((o) => (
            <li
              key={o.id}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2 ring-1 ring-border/40"
            >
              <div className="min-w-0">
                <span className="text-[12.5px] font-medium">{o.name}</span>
                <span className="ml-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {o.countries.join(" · ")}
                </span>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{o.note}</div>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                {TONE_WORD[o.tone]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
