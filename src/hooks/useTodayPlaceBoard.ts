// useTodayPlaceBoard — the content behind Today's place strip.
//
// It reads state Awareness already holds (the persisted scan of this spot, the
// layer reads on file) plus the calendar Echo can already see, and hands the
// pure reader one input. No watcher, no background scan: the only scan is the
// explicit tap this hook exposes.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useAgenda } from "@/hooks/useAgenda";
import { agoPhrase } from "@/lib/awarenessShelves";
import { readPlaceBoard, type PlaceBoard } from "@/lib/placeBoard";
import { coerceSignal } from "@/lib/vantaSignal";

const DAY_MS = 86_400_000;

export function useTodayPlaceBoard(): {
  board: PlaceBoard;
  scanning: boolean;
  scan: () => void;
} {
  const { place, snapshot, snapshotLoading, refreshSnapshot, latestBySection } = useAwareness();
  const { events } = useAgenda({ days: 1 });

  /* The same nearby-places lookup the Aware desk uses: map data, cached
     server-side. One read per fix — no watcher, no polling. It is what lets
     Today name real ground before anything has been scanned here. */
  const [towns, setTowns] = useState<Array<{ name: string; detail: string | null; distanceM: number }>>([]);
  const fixLat = Number((place?.geo as any)?.lat);
  const fixLon = Number((place?.geo as any)?.lon);
  useEffect(() => {
    if (!Number.isFinite(fixLat) || !Number.isFinite(fixLon)) {
      setTowns([]);
      return;
    }
    let live = true;
    void supabase.functions
      .invoke("awareness-nearby-places", { body: { lat: fixLat, lon: fixLon } })
      .then(({ data }) => {
        if (!live) return;
        const rows = ((data as any)?.places ?? []) as Array<{ name?: string; kind?: string; distance_m?: number }>;
        setTowns(
          rows
            .filter((r) => r.name && Number.isFinite(Number(r.distance_m)))
            .map((r) => ({
              name: String(r.name),
              detail: r.kind ? `${r.kind}, from map data.` : null,
              distanceM: Number(r.distance_m),
            })),
        );
      })
      .catch(() => {
        /* A missing lookup stays missing. The strip says what it has. */
      });
    return () => {
      live = false;
    };
  }, [fixLat, fixLon]);

  const board = useMemo(() => {
    const local = (((snapshot?.full_data as any)?.local_signals ?? []) as Array<{
      title?: string;
      snippet?: string;
      kind?: string;
      distance_m?: number;
    }>).filter((s) => s.kind === "place" && s.title);

    const nearby = local.map((s) => ({
      name: String(s.title),
      detail: s.snippet ?? null,
      distanceM: Number.isFinite(Number(s.distance_m)) ? Number(s.distance_m) : null,
    }));

    /* Local changes: layers read again in the last day, worded from the record
       and nothing else. */
    const changes = Object.entries(latestBySection ?? {})
      .filter(([, b]) => {
        const t = b ? new Date(b.generated_at).getTime() : NaN;
        return Number.isFinite(t) && Date.now() - t < DAY_MS;
      })
      .map(([section, b]) => {
        const sig = coerceSignal((b as any)?.signal ?? {});
        return {
          key: section,
          text: sig.title ? `${section}: ${sig.title}` : `${section} was read again ${agoPhrase((b as any).generated_at)}.`,
          detail: sig.short_summary || null,
        };
      });

    return readPlaceBoard({
      nearby,
      changes,
      events,
      scanAt: snapshot?.generated_at ?? null,
    });
  }, [snapshot, latestBySection, events]);

  const scan = useCallback(() => {
    void refreshSnapshot(true).catch(() => {});
  }, [refreshSnapshot]);

  return { board, scanning: snapshotLoading, scan };
}
