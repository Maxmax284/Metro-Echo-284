// TempUnitToggle — the unit switch lives where the temperature is read, not in
// a Settings drawer. One tap flips every weather read on the device through
// the shared `vanta.tempunit` key (tempUnit.ts owns it — never touch storage
// anywhere else).
import { useTempUnit } from "@/lib/tempUnit";
import { cn } from "@/lib/utils";

export function TempUnitToggle({ className }: { className?: string }) {
  const [unit, setUnit] = useTempUnit();
  return (
    <span
      role="group"
      aria-label="Temperature unit"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border/70 bg-muted/40 p-px font-mono text-[9.5px] uppercase tracking-[0.1em]",
        className,
      )}
    >
      {(["c", "f"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={(e) => {
            e.stopPropagation();
            if (unit !== u) setUnit(u);
          }}
          className={cn(
            "min-h-[26px] min-w-[30px] rounded-full px-1.5 leading-none transition-colors",
            unit === u
              ? "bg-foreground/90 text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          °{u.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
