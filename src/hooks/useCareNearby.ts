// useCareNearby — the care directory for the fix Echo already holds.
//
// Doctrine:
//   - One lookup per fix, on the tap. No watcher, no polling.
//   - No fix means no list, said plainly, rather than a list from the last city.
//   - Kept places are the person's own record; they land in the places table with
//     a care category so the board can show them.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAwareness } from "@/providers/AwarenessProvider";
import type { CareKind, CarePlace } from "@/lib/careFinder";

export type KeptCare = {
  id: string;
  label: string;
  address: string | null;
  notes: string | null;
  lat: number | null;
  lon: number | null;
};

export function useCareNearby(kinds: CareKind[] = []) {
  const { user } = useAuth();
  const { place } = useAwareness();
  const [places, setPlaces] = useState<CarePlace[]>([]);
  const [radiusM, setRadiusM] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<KeptCare[]>([]);

  const lat = Number((place?.geo as any)?.lat);
  const lon = Number((place?.geo as any)?.lon);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lon);
  const country = (place?.country as string | null) ?? null;
  const kindKey = useMemo(() => [...kinds].sort().join("+"), [kinds]);

  const look = useCallback(async () => {
    if (!hasFix) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("care-nearby", {
        body: { lat, lon, kinds: kinds.length ? kinds : undefined },
      });
      if (err) throw err;
      setPlaces(((data as any)?.places ?? []) as CarePlace[]);
      setRadiusM(Number((data as any)?.radius_m ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The map could not be read just now.");
    } finally {
      setLoading(false);
    }
  }, [hasFix, lat, lon, kindKey]);

  const loadKept = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("awareness_places")
      .select("id, label, address, notes, geo")
      .eq("user_id", user.id)
      .eq("category", "care")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    setKept(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        label: r.label,
        address: r.address ?? null,
        notes: r.notes ?? null,
        lat: Number.isFinite(Number(r.geo?.lat)) ? Number(r.geo.lat) : null,
        lon: Number.isFinite(Number(r.geo?.lon)) ? Number(r.geo.lon) : null,
      })),
    );
  }, [user]);

  useEffect(() => {
    void loadKept();
  }, [loadKept]);

  /* The first look happens when a fix exists and the kinds change — one call. */
  useEffect(() => {
    void look();
  }, [look]);

  const keep = useCallback(
    async (p: CarePlace) => {
      if (!user) return;
      await supabase.from("awareness_places").insert({
        user_id: user.id,
        label: p.name,
        category: "care",
        address: p.address,
        country,
        notes: [p.phone ? `Phone: ${p.phone}` : "", p.hours ? `Hours as recorded: ${p.hours}` : ""]
          .filter(Boolean)
          .join(" · ") || null,
        geo: { lat: p.lat, lon: p.lon, kind: p.kind },
      });
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "place",
        event: "care.kept",
        payload: { name: p.name, kind: p.kind },
      });
      await loadKept();
    },
    [user, country, loadKept],
  );

  const forget = useCallback(
    async (id: string) => {
      await supabase.from("awareness_places").update({ archived_at: new Date().toISOString() }).eq("id", id);
      await loadKept();
    },
    [loadKept],
  );

  return { places, radiusM, loading, error, hasFix, country, kept, look, keep, forget };
}
