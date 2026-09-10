// SavedPlacesPanel — your own places, always visible on the place desk.
//
// Recorded ground truth: every distance here was measured from the fix Echo is
// using against a pin you saved yourself. Nothing is looked up, nothing is
// guessed, and switching or deleting a place is always your tap.
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MachineLabel } from "@/components/ui/instrument";
import { EmptyState } from "@/components/ui/state-views";
import { formatDistance } from "@/lib/trips";
import { driveLabel } from "@/hooks/useTravelTimes";
import { cn } from "@/lib/utils";

export type SavedPlaceRow = {
  id: string;
  label: string;
  country?: string | null;
  region?: string | null;
  /** Measured from the current fix, when both have coordinates. */
  distanceM?: number | null;
  /** Road driving time from the current fix, from map routing. Null when unknown. */
  travelS?: number | null;
  /** Road distance from the same route, when the router returned one. */
  roadDistanceM?: number | null;
  unresolved?: boolean;
};

export function SavedPlacesPanel({
  places,
  activeId,
  newLabel,
  onNewLabel,
  onCaptureHere,
  onSwitch,
  onDelete,
  className,
}: {
  places: SavedPlaceRow[];
  activeId: string | null;
  newLabel: string;
  onNewLabel: (v: string) => void;
  onCaptureHere: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string, label: string) => void;
  className?: string;
}) {
  const sorted = [...places].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    const da = Number.isFinite(Number(a.distanceM)) ? Number(a.distanceM) : Infinity;
    const db = Number.isFinite(Number(b.distanceM)) ? Number(b.distanceM) : Infinity;
    return da - db;
  });

  return (
    <section className={cn("vanta-card rounded-xl p-3", className)} aria-label="Saved places">
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <MachineLabel className="text-foreground/70">Saved places</MachineLabel>
        <span className="ml-auto text-[11px] text-muted-foreground">{places.length}</span>
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          placeholder="Name this place (optional)"
          value={newLabel}
          onChange={(e) => onNewLabel(e.target.value)}
          className="h-10"
        />
        <Button onClick={onCaptureHere} className="h-10 shrink-0 gap-1">
          <MapPin className="h-4 w-4" /> Save here
        </Button>
      </div>

      {places.length === 0 ? (
        <EmptyState
          className="mt-2"
          icon={<MapPin className="h-4 w-4" />}
          title="No places saved"
          hint="Save where you are and Echo has something to measure against — distances, arrivals and local reads all start from a saved place."
          flow={["Save here", "Place", "Local read"]}
        />
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sorted.map((p) => {
            const isActive = p.id === activeId;
            const dist = Number.isFinite(Number(p.distanceM)) ? formatDistance(Number(p.distanceM)) : null;
            const where = [p.region, p.country].filter(Boolean).join(", ");
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated/30 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => !isActive && onSwitch(p.id)}
                    disabled={isActive}
                    className="block max-w-full truncate text-left text-[13px] font-medium text-foreground hover:text-primary disabled:cursor-default"
                  >
                    {p.label}
                  </button>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {isActive
                      ? `Echo is reading from here${where ? ` · ${where}` : ""}`
                      : [dist ? `${dist} away` : "no distance on file", where].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {p.unresolved ? (
                  <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-warn ring-1 ring-warn/30">
                    unresolved
                  </span>
                ) : null}
                {isActive ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary ring-1 ring-primary/30">
                    active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDelete(p.id, p.label)}
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${p.label}`}
                    title="Delete place"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
