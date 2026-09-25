// NearbyPlacesPanel — named ground around the fix, on the place desk.
//
// Two sources, both recorded: the nearby-places lookup (map data, cached
// server-side) and whatever the last scan of this spot found. Nothing is
// invented, and a scan only runs when you tap it.
import { Compass, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { formatDistance } from "@/lib/trips";
import { cn } from "@/lib/utils";

export type NearbyRow = {
  key: string;
  name: string;
  /** The local-script name, when it differs from the English one. Quiet second line. */
  localName?: string | null;
  detail?: string | null;
  distanceM?: number | null;
  /** Where the row came from, said plainly under the name. */
  source: "map" | "scan";
};


export function NearbyPlacesPanel({
  rows,
  scanLine,
  scanning,
  onScan,
  className,
}: {
  rows: NearbyRow[];
  /** "Scanned 3h ago" / "Never scanned here". */
  scanLine: string;
  scanning?: boolean;
  onScan?: () => void;
  className?: string;
}) {
  const sorted = [...rows].sort((a, b) => {
    const da = Number.isFinite(Number(a.distanceM)) ? Number(a.distanceM) : Infinity;
    const db = Number.isFinite(Number(b.distanceM)) ? Number(b.distanceM) : Infinity;
    return da - db;
  });

  return (
    <section className={cn("vanta-card rounded-xl p-3", className)} aria-label="Nearby places">
      <div className="flex items-center gap-1.5">
        <Compass className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <MachineLabel className="text-foreground/70">Nearby places</MachineLabel>
        <span className="ml-auto text-[11px] text-muted-foreground">{rows.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Nothing named around this fix yet. Read this spot once and towns, streets and businesses
          that map data actually knows about land here with a measured distance.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sorted.slice(0, 12).map((r) => (
            <li key={r.key} className="rounded-lg border border-border/50 bg-surface-elevated/30 px-2.5 py-2">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{r.name}</span>
                {Number.isFinite(Number(r.distanceM)) ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistance(Number(r.distanceM))}
                  </span>
                ) : null}
              </div>
              {r.localName?.trim() && r.localName.trim() !== r.name.trim() ? (
                <p className="truncate text-[11.5px] leading-snug text-foreground/60">{r.localName}</p>
              ) : null}

              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {r.detail?.trim()
                  ? r.detail
                  : r.source === "map"
                    ? "From the nearby-places lookup — map data, not a web search."
                    : "Found by the last read of this spot."}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">{scanLine}</span>
        {onScan ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-9 gap-1 text-[12px]"
            disabled={scanning}
            onClick={onScan}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {scanning ? "Reading…" : "Read this spot"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
