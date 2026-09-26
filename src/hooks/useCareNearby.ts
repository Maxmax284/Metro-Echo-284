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

const HEALTH_KINDS: CareKind[] = ["emergency", "hospital", "clinic", "doctor", "pharmacy", "dentist"];

export function useCareNearby(kinds: CareKind[] = [], opts?: { lookup?: boolean }) {
  /* A board reading somewhere you are not standing passes lookup: false —
     kept places still load, but no care lookup fires for the live fix. */
  const lookupEnabled = opts?.lookup !== false;
  const { user } = useAuth();
  const { place } = useAwareness();
  const [places, setPlaces] = useState<CarePlace[]>([]);
  const [radiusM, setRadiusM] = useState<number>(0);
  const [source, setSource] = useState<string>("google");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<KeptCare[]>([]);

  const lat = Number((place?.geo as any)?.lat);
  const lon = Number((place?.geo as any)?.lon);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lon);
  const country = (place?.country as string | null) ?? null;
  const kindKey = useMemo(() => [...kinds].sort().join("+"), [kinds]);

  const look = useCallback(async (refresh = false) => {
    if (!hasFix) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("care-nearby", {
        body: { lat, lon, kinds: kinds.length ? kinds : undefined, refresh },
      });
      if (err) throw err;
      setPlaces(((data as any)?.places ?? []) as CarePlace[]);
      setRadiusM(Number((data as any)?.radius_m ?? 0));
      setSource(String((data as any)?.source ?? "google"));
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
      .in("category", ["care", "nearby"])
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

  /* The first look happens when a fix exists and the kinds change — one call.
     With lookup disabled the list stays empty and says so instead of
     borrowing care from wherever you happen to be standing. */
  useEffect(() => {
    if (lookupEnabled) void look();
  }, [look, lookupEnabled]);

  const keep = useCallback(
    async (p: CarePlace) => {
      if (!user) return;
      const isHealth = HEALTH_KINDS.includes(p.kind);
      await supabase.from("awareness_places").insert({
        user_id: user.id,
        label: p.name,
        category: isHealth ? "care" : "nearby",
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
        event: "place.kept_nearby",
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

  const placeLabel = (place?.geo as any)?.display_name || place?.label || null;

  return { places, radiusM, source, loading, error, hasFix, country, placeLabel, kept, look, keep, forget };
}
