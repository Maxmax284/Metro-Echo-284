// useTodayPlaceCue — Today's only line of enquiry about location.
//
// It reads state that other things already fetched (the awareness place, the
// running trip, the clock drift Today already computed) and hands the pure
// reader one input. It starts no watcher, opens no socket, and never asks the
// device for a fix. Awareness stays underneath Today; this is the seam.
import { useEffect, useRef } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useTrips } from "@/hooks/useTrips";
import { placeTruth } from "@/lib/placeTruth";
import { readPlaceCue, type PlaceCue } from "@/lib/todayContext";

export function useTodayPlaceCue(input: {
  /** How many lines the situational read put on the board. */
  lineCount: number;
  /** True when a line on the board is worded from where you are. */
  explainsRead?: boolean;
  /** The clock disagrees with the device and Echo has already said so. */
  timezoneDrift?: boolean;
  /** Severe board. The strip simplifies instead of decorating. */
  pressure?: boolean;
}): PlaceCue {
  const { place } = useAwareness();
  const { running } = useTrips();
  const truth = placeTruth(place);

  /* A move is only a move when Echo previously had a different named place in
     this session. No history invented on a cold load — the first read is just
     where you are. */
  const seen = useRef<string | null>(null);
  const movedFrom = seen.current && truth.name && seen.current !== truth.name ? seen.current : null;
  useEffect(() => {
    if (truth.name) seen.current = truth.name;
  }, [truth.name]);

  return readPlaceCue({
    name: truth.name,
    age: truth.age,
    stale: truth.stale,
    lineCount: input.lineCount,
    explainsRead: input.explainsRead,
    movedFrom,
    timezoneDrift: input.timezoneDrift,
    tripActive: !!running,
    pressure: input.pressure,
  });
}
