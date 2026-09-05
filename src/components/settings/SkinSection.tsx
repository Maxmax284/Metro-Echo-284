// Skin picker — how the room looks, per device.
//
// This is presentation only. No skin ever changes what Echo says or what a
// number means, so switching is safe at any time and takes effect instantly.
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { SKINS, readAmbient, readSkin, writeAmbient, writeSkin, type SkinId } from "@/lib/skins";
import { Layers } from "lucide-react";

export function SkinSection() {
  const [skin, setSkin] = useState<SkinId>(() => readSkin());
  const [ambient, setAmbient] = useState<boolean>(() => readAmbient());

  const pick = (next: SkinId) => {
    setSkin(next);
    writeSkin(next);
  };

  const toggleAmbient = (next: boolean) => {
    setAmbient(next);
    writeAmbient(next);
  };

  return (
    <section className="vanta-card p-4">
      <header className="flex items-start gap-3">
        <Layers className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
        <div>
          <h2 className="text-sm font-medium tracking-tight">Skin</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The texture behind every room. This device only — it does not change any of your data
            or what Echo tells you.
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SKINS.map((s) => {
          const active = s.id === skin;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              aria-pressed={active}
              className={cn(
                "vanta-inset min-h-[44px] px-3 py-2.5 text-left",
                MOTION_ROW,
                MOTION_FOCUS,
                active && "ring-1 ring-accent/50",
              )}
            >
              <span className={cn("block text-sm", active ? "text-accent" : "text-foreground/90")}>
                {s.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/50 pt-3">
        <div>
          <p className="text-sm">Background motion</p>
          <p className="text-[11px] text-muted-foreground">
            Off keeps the colour wash and stops everything that drifts.
          </p>
        </div>
        <Switch checked={ambient} onCheckedChange={toggleAmbient} aria-label="Background motion" />
      </div>
    </section>
  );
}
