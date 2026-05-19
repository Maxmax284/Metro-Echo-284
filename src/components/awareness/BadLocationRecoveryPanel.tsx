import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Crosshair, MapPin, Search, Trash2, X, AlertTriangle } from "lucide-react";
import { vantaSay, vantaToast as toast } from "@/lib/vantaVoice";
import {
  sampleHighAccuracy,
  classifyPlaceBadness,
  distMeters,
  searchPlaces,
  type PlaceSearchHit,
} from "@/lib/locationSanity";

type Props = {
  /** Other usable saved places to offer as fallbacks. */
  alternatives: AwarenessPlace[];
  /** Hide self when user dismisses. */
  onDismiss?: () => void;
};

/**
 * BadLocationRecoveryPanel — shown when the active place can't resolve.
 * Gives the user a real way out: quick recenter, high-accuracy recenter,
 * switch to a saved place, manual search, or delete the bad pin.
 */
export function BadLocationRecoveryPanel({ alternatives, onDismiss }: Props) {
  const { session } = useAuth();
  const { place, refresh, refreshSnapshot, setActivePlace, deletePlace } = useAwareness();
  const [busy, setBusy] = useState<null | "quick" | "ha" | "search" | "delete" | "switch">(null);
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const badness = classifyPlaceBadness(place);

  // Auto-refresh prompt: when the active place transitions from no-country
  // to a real country, offer a rescan. Detected via parent re-render of `place`.
  useEffect(() => {
    if (place && place.country && !badness.bad) {
      // Country resolved — quietly clear any sticky search state.
      setSampleStatus(null);
    }
  }, [place, badness.bad]);

  const reverseGeocode = async (placeId: string) => {
    try {
      await supabase.functions.invoke("awareness-geocode", { body: { place_id: placeId, force: true } });
    } catch {/* surfaced by feedback below */}
    await refresh();
  };

  const quickRecenter = async () => {
    if (!place) return;
    setBusy("quick");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const before: any = place.geo ?? {};
        const next = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
        const sameAsBefore =
          Number.isFinite(before.lat) &&
          distMeters({ lat: before.lat, lon: before.lon }, { lat: next.lat, lon: next.lon }) < 50;
        if (sameAsBefore) {
          toast.error(vantaSay.sameBadFix());
          setBusy(null);
          return;
        }
        await supabase
          .from("awareness_places")
          .update({ geo: next, country: null, region: null, updated_at: new Date().toISOString() })
          .eq("id", place.id);
        toast.success(vantaSay.gotGps());
        await reverseGeocode(place.id);
        setBusy(null);
      },
      (err) => {
        setBusy(null);
        if (err.code === 1) toast.error(vantaSay.permissionLocation());
        else if (err.code === 3) toast.error(vantaSay.locationTimeout());
        else toast.error(vantaSay.locationUnavailable());
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  };

  const highAccuracyRecenter = async () => {
    if (!place) return;
    setBusy("ha");
    setSampleStatus(vantaSay.highAccuracySampling(7));
    try {
      const { best, samples } = await sampleHighAccuracy(7000, (_, n) => {
        setSampleStatus(`Reading GPS… ${n} sample${n === 1 ? "" : "s"}`);
      });
      const before = place.geo ?? {};
      const sameAsBefore =
        Number.isFinite(before.lat) &&
        distMeters({ lat: before.lat, lon: before.lon }, { lat: best.lat, lon: best.lon }) < 50;
      if (sameAsBefore) {
        toast.error(vantaSay.sameBadFix());
        setSampleStatus(null);
        setBusy(null);
        return;
      }
      await supabase
        .from("awareness_places")
        .update({
          geo: { lat: best.lat, lon: best.lon, acc: best.acc, samples: samples.length },
          country: null,
          region: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", place.id);
      toast.success(vantaSay.gotGps());
      await reverseGeocode(place.id);
      // After reverse-geocode, AwarenessProvider re-fetches via realtime/refresh;
      // if country still null after geocode, surface a soft warning.
      const { data: fresh } = await supabase
        .from("awareness_places")
        .select("country, region, geo")
        .eq("id", place.id)
        .maybeSingle();
      if (!fresh?.country) {
        toast.error(vantaSay.highAccuracyFailed());
      } else {
        toast.success(vantaSay.geocodeOk([((fresh.geo as any)?.city), fresh.region, fresh.country].filter(Boolean).join(", ")));
      }
    } catch (e: any) {
      if (e?.code === 1) toast.error(vantaSay.permissionLocation());
      else toast.error(vantaSay.highAccuracyFailed());
    } finally {
      setSampleStatus(null);
      setBusy(null);
    }
  };

  const runSearch = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy("search");
    try {
      const out = await searchPlaces(query, ac.signal);
      setHits(out);
      if (out.length === 0) toast.error(vantaSay.manualPlaceMiss());
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(vantaSay.manualPlaceMiss());
    } finally {
      setBusy(null);
    }
  };

  const useHit = async (hit: PlaceSearchHit) => {
    if (!session) return;
    setBusy("search");
    try {
      const label = hit.city
        ? `${hit.city}${hit.region ? `, ${hit.region}` : ""}`
        : hit.display_name.split(",").slice(0, 2).join(",");
      const { data } = await supabase
        .from("awareness_places")
        .insert({
          user_id: session.user.id,
          label,
          geo: { lat: hit.lat, lon: hit.lon, source: "manual_search", city: hit.city ?? null },
          country: hit.country ?? null,
          region: hit.region ?? null,
        })
        .select("id")
        .single();
      if (data) {
        toast.success(vantaSay.manualPlaceSaved(label));
        await refresh();
        // Offer rescan
        await refreshSnapshot(false).catch(() => {});
      }
    } finally {
      setBusy(null);
    }
  };

  const useSaved = async (alt: AwarenessPlace) => {
    setBusy("switch");
    try {
      await setActivePlace(alt.id);
      toast.success(vantaSay.switchedPlace(alt.label));
    } finally {
      setBusy(null);
    }
  };

  const removeBad = async () => {
    if (!place) return;
    if (!confirm("Delete this bad location? It looks unusable and can be recreated later.")) return;
    setBusy("delete");
    try {
      await deletePlace(place.id);
      toast.success(vantaSay.placeDeleted());
    } finally {
      setBusy(null);
    }
  };

  if (!place) return null;

  return (
    <div className="rounded-xl border border-warn/40 bg-warn/[0.05] p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-warn shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            {badness.headline || "Location looks wrong"}
          </div>
          <div className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">
            I'm not pretending this pin is a real local place. Pick a fix below.
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Button
          size="sm"
          className="h-9 gap-1.5 text-[12px] justify-start"
          onClick={highAccuracyRecenter}
          disabled={!!busy}
        >
          {busy === "ha" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          High accuracy recenter
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 text-[12px] justify-start"
          onClick={quickRecenter}
          disabled={!!busy}
        >
          {busy === "quick" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          Quick recenter
        </Button>
      </div>

      {sampleStatus && (
        <div className="text-[11px] text-muted-foreground">{sampleStatus}</div>
      )}

      {/* Manual search */}
      <div className="space-y-1.5">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Search a place
        </div>
        <div className="flex gap-1.5">
          <Input
            placeholder="e.g. Lamai, Koh Samui"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="h-9 text-[12px]"
          />
          <Button size="sm" className="h-9 gap-1 shrink-0" onClick={runSearch} disabled={!!busy || !query.trim()}>
            {busy === "search" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {hits.length > 0 && (
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {hits.map((h, i) => (
              <li key={i}>
                <button
                  onClick={() => useHit(h)}
                  className="w-full text-left rounded-md border border-border/50 bg-surface-elevated/40 px-2.5 py-1.5 text-[11.5px] hover:bg-surface-elevated/70"
                >
                  <div className="text-foreground/90 truncate">{h.display_name}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Saved fallbacks */}
      {alternatives.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Use a saved place
          </div>
          <ul className="space-y-1">
            {alternatives.slice(0, 4).map((alt) => (
              <li key={alt.id}>
                <button
                  onClick={() => useSaved(alt)}
                  disabled={!!busy}
                  className="w-full inline-flex items-center gap-2 rounded-md border border-border/50 bg-surface-elevated/40 px-2.5 py-1.5 text-[11.5px] hover:bg-surface-elevated/70 disabled:opacity-60"
                >
                  <MapPin className="h-3 w-3 text-primary/80" />
                  <span className="truncate text-foreground/90">{alt.label}</span>
                  {alt.country && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{alt.country}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-[11.5px] text-muted-foreground hover:text-destructive"
          onClick={removeBad}
          disabled={!!busy}
        >
          {busy === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Delete this bad place
        </Button>
      </div>
    </div>
  );
}
