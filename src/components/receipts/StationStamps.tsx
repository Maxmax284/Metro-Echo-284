// StationStamps — the wall of marks you pressed on purpose, folded into
// Receipts where every other proof lives.
//
// A place you stamped, a trip you closed with your own word — each one hangs
// here as a stamp with the name as it was when you pressed it. Lift a stamp
// or reopen a wrap and the mark leaves the wall; nothing arrives on its own,
// and no mark ever carries coordinates or a route history. Tap any mark and
// it shows the record it stands on — the trip's legs as the books hold them,
// or the stamp's own press-and-lift history.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useStationMarks } from "@/hooks/useStationMarks";
import { markDateWords, wallTilt, type StationMark } from "@/lib/stationMarks";
import { MarkRecordSheet } from "@/components/receipts/MarkRecordSheet";

export function StationStamps({ className }: { className?: string }) {
  const { marks, rows } = useStationMarks();
  const [openMark, setOpenMark] = useState<StationMark | null>(null);
  /* Unknown stays silent — the wall never guesses at your marks. */
  if (!marks) return null;

  return (
    <section aria-label="Station stamps" className={cn("vanta-card p-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Station stamps
      </p>
      {marks.length === 0 ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Nothing pressed yet. Stamp the ground you're standing on from the place board, or close a
          trip, and the mark lands here. Lift a stamp and it leaves the wall — nothing arrives on
          its own.
        </p>
      ) : (
        <>
          <ul className="stamp-wall mt-3">
            {marks.map((mark) => (
              <li key={mark.key}>
                <button
                  type="button"
                  className={cn(
                    "wall-stamp cursor-pointer text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mark.kind === "journey" ? "wall-stamp-journey" : "wall-stamp-place",
                  )}
                  style={{ transform: `rotate(${wallTilt(mark.key)}deg)` }}
                  aria-label={`${mark.kind === "journey" ? "Trip" : "Place"} mark: ${mark.name}, pressed ${markDateWords(mark.at)}. Show its record.`}
                  onClick={() => setOpenMark(mark)}
                >
                  <span className="wall-stamp-name">{mark.name}</span>
                  <span className="wall-stamp-meta">
                    {mark.kind === "journey" ? "trip closed" : "place"} · {markDateWords(mark.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">
            Every mark is one you pressed on purpose — a place you stamped or a trip you closed.
            Names are kept as snapshots; no coordinates, no route history. Tap a mark for its
            record.
          </p>
        </>
      )}
      <MarkRecordSheet
        mark={openMark}
        rows={rows}
        open={openMark !== null}
        onOpenChange={(next) => {
          if (!next) setOpenMark(null);
        }}
      />
    </section>
  );
}
