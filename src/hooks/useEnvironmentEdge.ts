// useEnvironmentEdge — one environmental read, shared by Ask and Today.
//
// It reads what other things already fetched (the awareness place, the stored
// timezone) plus one small scoped query for the next calendar entry. It starts
// no watcher, asks the device for nothing, and renders nothing when there is
// nothing honest to say.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { fusePlace, type PlaceEvidence } from "@/lib/placeState";
import { environmentEdge, environmentLine, type EnvironmentEdge } from "@/lib/environmentEdge";

export function useEnvironmentEdge(): { edge: EnvironmentEdge; line: string; loading: boolean } {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const { place } = useAwareness();
  const { timezone, storedTimezone } = useUserTimezone();

  const [next, setNext] = useState<{ words: string; atIso: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let live = true;
    void (async () => {
      const { data } = await applyScope(
        supabase.from("calendar_events").select("title, starts_at"),
      )
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1);
      if (!live) return;
      const row = data?.[0];
      setNext(row?.starts_at ? { words: "next", atIso: row.starts_at } : null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [user, key, applyScope]);

  const state = useMemo(() => {
    const evidence: PlaceEvidence[] = [];
    if (place?.country || place?.label) {
      evidence.push({
        kind: "device_fix",
        role: "current",
        where: {
          country: place.country ?? null,
          region: place.region ?? null,
          locality: place.label ?? null,
        },
        level: place.label ? "locality" : "country",
        stamp: {
          source: "your recorded place",
          authority: "own_record",
          readAt: place.updated_at ?? null,
        },
      });
    }
    if (storedTimezone) {
      evidence.push({
        kind: "device_timezone",
        role: "current",
        where: { country: null },
        level: "country",
        stamp: { source: "your clock setting", authority: "reported", readAt: new Date().toISOString() },
      });
    }
    return evidence.length ? fusePlace("current", evidence) : null;
  }, [place, storedTimezone]);

  const edge = useMemo(
    () => environmentEdge({ place: state, timezone, next }),
    [state, timezone, next],
  );

  return { edge, line: environmentLine(edge), loading };
}
