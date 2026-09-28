// StationEdition — the window decal a kept day leaves on the Today concourse.
//
// The boot stamps the day once at the door; this holds it, quietly, until
// the window passes. Same law as the stamp: opt-in per device, a fresh fix,
// a country the kept list speaks — anything less renders nothing at all.
// It is atmosphere, not a control: it names the day and says when it leaves,
// and it never asks to be tapped.
import { useMemo } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth } from "@/lib/placeTruth";
import { OCCASIONS_KEY } from "@/lib/occasions";
import { editionFor } from "@/lib/stationEdition";
import { cn } from "@/lib/utils";

function readOptedIn(): boolean {
  try {
    return localStorage.getItem(OCCASIONS_KEY) === "1";
  } catch {
    return false;
  }
}

export function StationEdition({ className }: { className?: string }) {
  const { place } = useAwareness();
  const truth = placeTruth(place);
  const country = place?.country ?? null;

  /* Read once per mount, like the boot does — the switch is per device and
     the next landing is soon enough for a flip to take effect. */
  const edition = useMemo(
    () => editionFor(new Date(), country, { optedIn: readOptedIn(), stale: truth.stale }),
    [country, truth.stale],
  );

  if (!edition) return null;

  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      role="note"
      aria-label={`${edition.name} — ${edition.note} The station edition holds through ${edition.until}.`}
      title={`${edition.note} Held through ${edition.until}.`}
    >
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        held through {edition.until}
      </span>
      <span className={cn("station-edition", `station-edition-${edition.tone}`, `edition-${edition.motif}`)}>
        {edition.name}
      </span>
    </div>
  );
}
