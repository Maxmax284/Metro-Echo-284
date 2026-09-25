import { useEffect, useMemo, useRef, useState } from "react";
import { useTravelTimes } from "@/hooks/useTravelTimes";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crosshair, Loader2, MapPin, Sparkles, Wrench, X } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { AwarenessHUD } from "@/components/shell/AwarenessHUD";
import { LayerChips } from "@/components/awareness/LayerChips";
import { PlaceSourceLine } from "@/components/context/ContextSourceLine";
import { SectionDrawer } from "@/components/awareness/SectionDrawer";
import { SignalCard } from "@/components/awareness/SignalCard";
import { BadLocationRecoveryPanel } from "@/components/awareness/BadLocationRecoveryPanel";
import { classifyPlaceBadness } from "@/lib/locationSanity";
import { placePatchForFix } from "@/lib/placeMove";
import { useSignalRoute } from "@/lib/useSignalRoute";
import { CONFIDENCE_TONE } from "@/lib/vantaSignal";
import { normalizeAwarenessSignal, classifyTier, tierScanCopy, terrainModeFor, terrainModeCaption, type LocationTier } from "@/lib/awarenessPlainTalk";
import { resolveLocationState, SOURCE_BADGE_LABEL, SOURCE_BADGE_TONE, logLocationDecision } from "@/lib/awarenessLocation";
import { useIsMobile } from "@/hooks/use-mobile";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useSystemControls } from "@/hooks/useSystemControls";
import { SourceStatusPill } from "@/components/awareness/SourceStatusPill";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/state-views";
import { AwarenessShelves } from "@/components/awareness/AwarenessShelves";
import { FieldSessionCard } from "@/components/field/FieldSessionCard";
import { useSituation } from "@/hooks/useSituation";
import { useTodayDigest } from "@/hooks/useTodayDigest";
import { WhatVantaSees } from "@/components/awareness/WhatVantaSees";
import { neverReadLine, readShelves } from "@/lib/awarenessShelves";
import { AWARENESS_SECTIONS } from "@/providers/AwarenessProvider";
import { FieldPolaroid } from "@/components/awareness/FieldPolaroid";
import { PlaceSwitcherRail } from "@/components/awareness/PlaceSwitcherRail";
import { AwarenessMapPanel } from "@/components/awareness/AwarenessMapPanel";
import { ArrivalsLane } from "@/components/awareness/ArrivalsLane";
import { placeTruth, placeSourceBadge, accuracyMetres, type PlaceLike } from "@/lib/placeTruth";
import { metersBetween } from "@/lib/trips";
import { SavedPlacesPanel, type ArchivedPlaceRow } from "@/components/awareness/SavedPlacesPanel";
import { archiveRecord, restoreRecord } from "@/lib/archive";
import { AddPlaceForm } from "@/components/awareness/AddPlaceForm";
import { NearbyPlacesPanel } from "@/components/awareness/NearbyPlacesPanel";
import { TripHistoryPanel } from "@/components/awareness/TripHistoryPanel";
import { placeDisplayLabel } from "@/lib/placeLabels";

const FRESH_MS = 24 * 60 * 60 * 1000;
const AGING_MS = 7 * 24 * 60 * 60 * 1000;
function freshLabel(generated: string | null): string {
  if (!generated) return "never scanned";
  const age = Date.now() - new Date(generated).getTime();
  const hours = age / (60 * 60 * 1000);
  if (hours < 1) return "just scanned";
  if (age < FRESH_MS) return `scanned ${Math.round(hours)}h ago`;
  const days = Math.round(age / (24 * 60 * 60 * 1000));
  if (age < AGING_MS) return `${days}d old — still useful`;
  return `${days}d old — time for a refresh`;
}

/** "never scanned" → "Never scanned". Wording stays, the sentence starts right. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AwarenessSurface() {
  const { session } = useAuth();
  const { place, briefings, overall, refresh, snapshot, snapshotLoading, refreshSnapshot, latestBySection, generate, generating, setActivePlace, deletePlace } = useAwareness();
  const isMobile = useIsMobile();
  const { controls } = useSystemControls();
  /* Same read Today uses, so a meeting can't be quiet here and loud there. */
  const digest = useTodayDigest();
  const { read: situation } = useSituation(digest);
  const onSignalRoute = useSignalRoute();
  const [places, setPlaces] = useState<AwarenessPlace[]>([]);
  /* Which place the field board is reading. null = wherever you are now. */
  const [boardPlaceId, setBoardPlaceId] = useState<string | null>(null);
  /* Pins you cleared off the desk. Read-only here until you restore one. */
  const [archivedPlaces, setArchivedPlaces] = useState<ArchivedPlaceRow[]>([]);
  
  const [newLabel, setNewLabel] = useState("");
  const [drawerSection, setDrawerSection] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [recentering, setRecentering] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [showRadar, setShowRadar] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [showMore, setShowMore] = useState(false);
  /* Named places around the current fix, from the same nearby lookup the
     location-recovery panel uses. Map data, cached server-side — no AI, no web
     search, and it feeds the "Around you" shelf so that shelf is about ground
     rather than about search results. */
  const [nearbyTowns, setNearbyTowns] = useState<
    Array<{ name: string; localName: string | null; kind: string | null; distanceM: number; lat?: number | null; lon?: number | null }>
  >([]);

  const fixLat = Number((place?.geo as any)?.lat);
  const fixLon = Number((place?.geo as any)?.lon);
  useEffect(() => {
    if (!Number.isFinite(fixLat) || !Number.isFinite(fixLon)) { setNearbyTowns([]); return; }
    let live = true;
    void supabase.functions
      .invoke("awareness-nearby-places", { body: { lat: fixLat, lon: fixLon } })
      .then(({ data }) => {
        if (!live) return;
        const rows = ((data as any)?.places ?? []) as Array<{
          name?: string;
          local_name?: string | null;
          kind?: string;
          distance_m?: number;
          lat?: number;
          lon?: number;
        }>;
        setNearbyTowns(
          rows
            .filter((r) => r.name && Number.isFinite(Number(r.distance_m)))
            .map((r) => ({
              name: String(r.name),
              localName: r.local_name ?? null,
              kind: r.kind ?? null,
              distanceM: Number(r.distance_m),
              lat: Number.isFinite(Number(r.lat)) ? Number(r.lat) : null,
              lon: Number.isFinite(Number(r.lon)) ? Number(r.lon) : null,
            })),
        );
      })

      .catch(() => { /* a missing nearby read stays missing; the shelf says so */ });
    return () => { live = false; };
  }, [fixLat, fixLon]);

  /* Your own saved places, measured from the fix Echo is using. Recorded ground
     truth: nothing is looked up for this. */
  const savedNearby = (() => {
    if (!Number.isFinite(fixLat) || !Number.isFinite(fixLon)) return [];
    const out: Array<{ id: string; label: string; distanceM: number }> = [];
    for (const p of places) {
      if (p.id === place?.id) continue;
      const g = p.geo as any;
      const lat = Number(g?.lat);
      const lon = Number(g?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ id: p.id, label: p.label, distanceM: metersBetween({ lat: fixLat, lon: fixLon }, { lat, lon }) });
    }
    return out;
  })();

  /* Real driving time to each of those places — road routing, one read per fix.
     A route the router can't work out stays absent; the panel says so. */
  const travelTargets = useMemo(
    () =>
      places
        .filter((p) => p.id !== place?.id)
        .map((p) => ({ id: p.id, lat: Number((p.geo as any)?.lat), lon: Number((p.geo as any)?.lon) }))
        .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon)),
    [places, place?.id],
  );
  const { legs: travelLegs } = useTravelTimes(
    Number.isFinite(fixLat) && Number.isFinite(fixLon) ? { lat: fixLat, lon: fixLon } : null,
    travelTargets,
  );

  /* The read before the newest one, per layer. Recorded history only — this is
     what lets the "Changed" shelf say what moved instead of that a scan ran. */
  const previousBySection = (() => {
    const seen = new Set<string>();
    const out: Record<string, { signal?: unknown; confidence?: string | null; generated_at: string } | undefined> = {};
    for (const b of briefings ?? []) {
      if (!seen.has(b.section)) { seen.add(b.section); continue; }
      if (!out[b.section]) out[b.section] = b as any;
    }
    return out;
  })();

  // Watch for country null → set transition to offer a rescan prompt + auto-fire snapshot once.
  const prevCountryRef = useRef<string | null | undefined>(undefined);
  const [newCountry, setNewCountry] = useState<{ from: string; to: string } | null>(null);
  const autoRescanFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!place) { prevCountryRef.current = undefined; return; }
    const prev = prevCountryRef.current;
    if (prev === null && place.country && autoRescanFiredRef.current !== place.id) {
      autoRescanFiredRef.current = place.id;
      toast.success(vantaSay.locationFixedRescan());
      setRecoveryOpen(false);
      setRecoveryDismissed(true);
      // Auto-fire a snapshot rescan for the freshly-resolved place.
      refreshSnapshot(true).catch(() => {});
    }
    /* A different country is a different read. The local brief on file was
       written about somewhere else, so Echo offers a fresh one instead of
       presenting the old one as current. Offer, never auto-run: a scan costs
       lookups and the traveller decides when it's worth it. */
    if (prev && place.country && prev !== place.country) {
      setNewCountry({ from: prev, to: place.country });
    }
    prevCountryRef.current = place.country ?? null;
  }, [place?.id, place?.country, refreshSnapshot]);

  const loadList = async () => {
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at,category,notes,address")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    setPlaces((data ?? []) as AwarenessPlace[]);
    const { data: gone } = await supabase
      .from("awareness_places")
      .select("id,label,country,region,archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(30);
    setArchivedPlaces((gone ?? []) as ArchivedPlaceRow[]);
  };

  useEffect(() => { if (session) loadList(); }, [session, place?.id]);

  /* Self-heal: a place with a fix but no name can't be spoken about, so Echo
     looks it up once. One attempt per place — never a loop, never silent
     repetition. */
  const healedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !place) return;
    const geo = (place.geo ?? {}) as Record<string, unknown>;
    const named = Boolean(geo.city || place.region || place.country);
    const hasFix = Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon));
    if (named || !hasFix || healedRef.current === place.id) return;
    healedRef.current = place.id;
    supabase.functions
      .invoke("awareness-geocode", { body: { place_id: place.id, force: true } })
      .then(() => refresh())
      .catch(() => {});
  }, [session, place?.id, place?.country, place?.region, refresh]);

  const badness = classifyPlaceBadness(place);
  const alternatives = places.filter((p) => p.id !== place?.id && !!p.country);
  // Open the panel automatically once when bad is first detected (per place).
  useEffect(() => {
    if (badness.bad && !recoveryDismissed) setRecoveryOpen(true);
    if (!badness.bad) setRecoveryDismissed(false);
  }, [badness.bad, place?.id]);


  const openSection = (section: string) => {
    setDrawerSection(section);
    setDrawerOpen(true);
  };

  const captureHere = async () => {
    if (!session || !navigator.geolocation) {
      toast.error(vantaSay.locationUnavailable());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const label = newLabel.trim() || `Spot ${new Date().toLocaleString()}`;
        /* Standing where a place already is? Move that one instead of leaving a
           second pin on the same doorstep. */
        const near = places.find((p) => {
          const g = (p.geo ?? {}) as any;
          if (!Number.isFinite(Number(g?.lat)) || !Number.isFinite(Number(g?.lon))) return false;
          return (
            metersBetween(
              { lat: pos.coords.latitude, lon: pos.coords.longitude },
              { lat: Number(g.lat), lon: Number(g.lon) },
            ) <= 75
          );
        });
        if (near) {
          await supabase
            .from("awareness_places")
            .update({
              geo: { ...((near.geo ?? {}) as any), lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, source: "device" },
              updated_at: new Date().toISOString(),
            })
            .eq("id", near.id);
          setNewLabel("");
          toast.success(`You're already at ${near.label} — Echo moved that pin instead of adding another.`);
          await setActivePlace(near.id);
          await refresh();
          await loadList();
          return;
        }
        const { data } = await supabase
          .from("awareness_places")
          .insert({
            user_id: session.user.id,
            label,
            geo: { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, source: "device" },
          })
          .select("id,label,geo,country,region,updated_at")
          .single();
        if (data) {
          setNewLabel("");
          setPlaces((p) => [data as AwarenessPlace, ...p]);
          // Fire-and-forget reverse geocode → fills country/region/city.
          supabase.functions.invoke("awareness-geocode", { body: { place_id: (data as any).id } }).catch(() => {});
          await refresh();
        }
      },
      () => toast.error(vantaSay.locationUnavailable()),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const recenter = () => {
    if (!session || !place) {
      toast.error("No active place to recenter on.");
      return;
    }
    if (!navigator.geolocation) {
      toast.error(vantaSay.locationUnavailable());
      return;
    }
    setRecentering(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const acc = pos.coords.accuracy;
        /* A fix far from the last one is a different place. The old city,
           country and region are cleared with the same write, so no later
           lookup can quietly fall back to where you used to be. */
        const { error } = await supabase
          .from("awareness_places")
          .update(placePatchForFix(place as any, {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            acc,
            source: "device",
          }))
          .eq("id", place.id);
        setRecentering(false);
        if (error) {
          toast.error(vantaSay.couldntSave());
          return;
        }
        if (acc && acc > 5000) {
          toast(vantaSay.roughFix(Math.round(acc / 1000)));
        } else {
          toast.success(vantaSay.recentered());
        }
        // Refresh reverse-geocode in the background so country/region/city stay in sync.
        supabase.functions.invoke("awareness-geocode", { body: { place_id: place.id, force: true } }).catch(() => {});
        await refresh();
      },
      (err) => {
        setRecentering(false);
        if (err.code === 1) {
          toast.error(vantaSay.permissionLocation());
        } else if (err.code === 2) {
          toast.error(vantaSay.locationUnavailable());
        } else if (err.code === 3) {
          toast.error(vantaSay.locationTimeout());
        } else {
          toast.error(vantaSay.locationUnavailable());
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const confTone = overall.confidence ? CONFIDENCE_TONE[overall.confidence] : "bg-muted/40 text-muted-foreground ring-border/60";
  const generatedAt = snapshot?.generated_at ?? overall.newest_at;

  /* The board can read any place you keep, not only the one you're standing in.
     Switching is a reading choice: it never moves your fix and never writes.
     Only named places can be read — a bare pin has nothing to say yet. */
  const readable = places.filter((p) => Boolean((p.geo as any)?.city || p.region || p.country));
  const liveId = place?.id ?? null;
  const switchable = [
    ...(place && readable.some((p) => p.id === place.id) ? [place] : place ? [place] : []),
    ...readable.filter((p) => p.id !== place?.id),
  ].map((p) => ({
    id: p.id,
    label: placeDisplayLabel(p.label),
    city: ((p.geo as any)?.city as string) ?? null,
    region: p.region ?? null,
    country: p.country ?? null,
  }));
  const boardPlace = (boardPlaceId ? places.find((p) => p.id === boardPlaceId) : null) ?? place ?? null;
  const boardIsLive = !boardPlaceId || boardPlaceId === liveId;
  const boardGeo = (boardPlace?.geo ?? {}) as Record<string, unknown>;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden">
      <div className="px-4 pt-3 pb-2 min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">Place and context</h2>
        <p className="text-xs text-muted-foreground break-words">
          What matters around you, with the map and deeper detail when you want it.
        </p>
      </div>

      <div className="scrollbar-thin flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-36 md:pb-24 safe-bottom space-y-4">
        {/* Place strip — sticky on mobile. Two clean lines. Extra chips in More. */}
        {place && (() => {
          const tier = classifyTier(place);
          const locState = resolveLocationState(place, {
            generatedAt,
            serpEnabled: controls?.serpapi_enabled,
            serpUsed: (snapshot?.sources_used ?? []).some((s) => s.toLowerCase().includes("serp")),
          });
          logLocationDecision("surface", locState, { placeId: place.id });
          const TONE: Record<LocationTier, string> = {
            exact:   "bg-primary/15 text-primary ring-primary/40",
            saved:   "bg-primary/10 text-primary ring-primary/30",
            area:    "bg-accent/15 text-accent ring-accent/40",
            city:    "bg-accent/10 text-accent ring-accent/30",
            country: "bg-warn/15 text-warn ring-warn/40",
            unknown: "bg-muted/40 text-muted-foreground ring-border/60",
          };
          // Limit badges so the strip stays calm — even tighter on mobile.
          const badgeCap = isMobile && !showAllBadges ? 2 : 4;
          const visibleBadges = locState.sources.slice(0, badgeCap);
          const hiddenBadgeCount = Math.max(0, locState.sources.length - visibleBadges.length);
          return (
            <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none md:mx-0 md:p-0">
              <div className="rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2 space-y-1.5">
                {/* Line 1 — which place this is. The honest read of where you
                    are lives below, once, so the strip no longer argues with
                    it in shorthand. */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                  <span className="font-medium text-[12px] text-foreground/90 truncate">{placeDisplayLabel(place.label)}</span>
                </div>

                {/* Only speak up here when the pin can't be used at all. */}
                {locState.placeUnresolved ? (
                  <div className="text-[11px] leading-snug text-warn">{locState.message}</div>
                ) : null}


                {/* Line 3 — primary action */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {locState.placeUnresolved ? (
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 text-[12px] flex-1 min-w-0"
                      onClick={() => setRecoveryOpen(true)}
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Fix location</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 text-[12px] flex-1 min-w-0"
                      onClick={recenter}
                      disabled={recentering}
                    >
                      {recentering ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Crosshair className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">Recenter</span>
                    </Button>
                  )}
                  <div className="shrink-0"><SourceStatusPill /></div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* The field board leads the room: which place you're reading, its real
            photographs, what it is, where it came from, the local hour and
            weather, and Echo's read on tap. Switching is reading, not moving. */}
        <PlaceSwitcherRail
          places={switchable}
          activeId={boardPlaceId}
          liveId={liveId}
          onSelect={(id) => setBoardPlaceId(id === liveId ? null : id)}
          onAdd={addReadingPlace}
        />

        {!boardIsLive && boardPlace ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Reading {placeDisplayLabel(boardPlace.label)} from your saved places. You are still in{" "}
            {placeDisplayLabel(place?.label ?? "your current spot")}.
          </p>
        ) : null}

        <FieldPolaroid
          key={boardPlace?.id ?? "live"}
          city={((boardGeo.city as string) ?? boardPlace?.label) ?? null}
          region={boardPlace?.region ?? null}
          country={boardPlace?.country ?? null}
          timeZone={(boardGeo.time_zone as string) ?? null}
          lat={Number.isFinite(Number(boardGeo.lat)) ? Number(boardGeo.lat) : null}
          lon={Number.isFinite(Number(boardGeo.lon)) ? Number(boardGeo.lon) : null}
          nearby={boardIsLive ? nearbyTowns.map((t: any) => t.name).filter(Boolean) : []}
        />

        {/* Bad Location Recovery — primary path when pin is unusable. */}
        {place && badness.bad && recoveryOpen && (
          <BadLocationRecoveryPanel
            alternatives={alternatives}
            onDismiss={() => { setRecoveryOpen(false); setRecoveryDismissed(true); }}
          />
        )}

        {/* New country, old brief. Echo says which read is on file and offers
            to look at the new place instead of dressing the old one up. */}
        {newCountry && place && (
          <div className="vanta-card rounded-xl p-3">
            <p className="text-[12.5px] leading-snug text-foreground">
              You were in {newCountry.from}. Echo now has you in {newCountry.to}.
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Everything read below was written about {newCountry.from}. It stays on file until
              you ask for a fresh look at {newCountry.to}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-8"
                onClick={() => { setNewCountry(null); refreshSnapshot(true).catch(() => {}); }}
              >
                Read {newCountry.to} now
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setNewCountry(null)}>
                Not now
              </Button>
            </div>
          </div>
        )}

        {/* One read of where you are, then four shelves. This is the answer;
            the radar, chips and place list below are only the workings. */}
        {(() => {
          const tier = classifyTier(place);
          const locState = resolveLocationState(place, { generatedAt });
          const shelvesRead = readShelves({
            place: place
              ? { label: place.label, city: (place.geo as any)?.city ?? null, region: place.region, country: place.country }
              : null,
            locationMessage: locState.message,
            placeUnresolved: locState.placeUnresolved,
            newestAt: overall.newest_at,
            locationWarning: (snapshot?.compact as any)?.location_warning ?? null,
            briefings: latestBySection as any,
            previousBriefings: previousBySection as any,
            layers: AWARENESS_SECTIONS,
            elsewhereMeetings: situation?.elsewhereMeetings ?? [],
            savedNearby,
            nearbyTowns,
            /* What the last scan actually found. Named venues from map data, so
               "Around you" answers the question instead of staying quiet while
               the record holds eight of them. */
            nearbyVenues: (((snapshot?.full_data as any)?.local_signals ?? []) as Array<{ title?: string; snippet?: string; kind?: string }>)
              .filter((s) => s.kind === "place" && s.title)
              .map((s) => ({ name: String(s.title), detail: s.snippet ?? null })),
            scanSummary: (snapshot?.compact as any)?.summary ?? null,
            scanAt: snapshot?.generated_at ?? null,
          });
          const never = neverReadLine(shelvesRead.neverRead);
          const truth = placeTruth(place as PlaceLike | null);
          const acc = accuracyMetres(place as PlaceLike | null);
          return (
            <div className="space-y-3">
              {/* One honest sentence about where this read is being made from —
                  never more precise than the fix earns. */}
              <p className="text-[13.5px] leading-relaxed text-foreground/90">{truth.line}</p>
              <p className="text-[11px] text-muted-foreground">
                {placeSourceBadge(truth)}
                {acc ? ` · accurate to about ${acc < 1000 ? `${Math.round(acc)}m` : `${Math.round(acc / 1000)}km`}` : ""}
              </p>
              <p className="text-[13.5px] leading-relaxed text-foreground/90">{shelvesRead.paragraph}</p>
              {tier.tier !== "unknown" ? null : null}
              <AwarenessShelves shelves={shelvesRead.shelves} onOpenSection={openSection} />
              {never && <p className="text-[11px] leading-snug text-muted-foreground/80">{never}</p>}
            </div>
          );
        })()}




        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full rounded-xl border border-border/60 bg-surface-elevated/20 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground"
        >
          {showMore ? "Show less" : "Saved places, nearby spots and past trips"}
        </button>

        {/* The map is the useful center of the deeper place view. */}

        <AwarenessMapPanel
          places={places as any}
          onMoved={loadList}
          /* Named ground on the map, from the same lookups the panels below read. */
          nearby={[
            ...nearbyTowns
              .filter((t) => Number.isFinite(Number(t.lat)) && Number.isFinite(Number(t.lon)))
              .map((t) => ({
                key: `town:${t.name}`,
                name: t.name,
                detail: t.kind ? `${t.kind}, from map data.` : null,
                lat: Number(t.lat),
                lon: Number(t.lon),
                distanceM: t.distanceM,
                source: "map" as const,
              })),
            ...(((snapshot?.full_data as any)?.local_signals ?? []) as Array<{
              title?: string;
              snippet?: string;
              kind?: string;
              distance_m?: number;
              lat?: number;
              lon?: number;
            }>)
              .filter((s) => s.kind === "place" && s.title && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)))
              .map((s) => ({
                key: `venue:${s.title}`,
                name: String(s.title),
                detail: s.snippet ?? null,
                lat: Number(s.lat),
                lon: Number(s.lon),
                distanceM: Number.isFinite(Number(s.distance_m)) ? Number(s.distance_m) : null,
                source: "scan" as const,
              })),
          ]}
          onSelectPlace={(id) => {
            if (id === place?.id) return;
            const row = places.find((p) => p.id === id);
            void setActivePlace(id).then(() => toast.success(vantaSay.switchedPlace(row?.label ?? "that place")));
          }}
        />

        {showMore ? <>
        <ArrivalsLane />
        <AddPlaceForm onSaved={loadList} />

        {/* The place desk proper: your pins, the named ground around the fix,
            the running trip and every leg you've closed. */}
        <SavedPlacesPanel
          places={places.map((p) => ({
            id: p.id,
            label: p.label,
            country: p.country ?? null,
            region: p.region ?? null,
            distanceM: savedNearby.find((s) => s.id === p.id)?.distanceM ?? null,
            travelS: travelLegs[p.id]?.durationS ?? null,
            roadDistanceM: travelLegs[p.id]?.distanceM ?? null,
            unresolved: classifyPlaceBadness(p as any).bad,
            category: p.category ?? null,
            notes: p.notes ?? null,
            address: p.address ?? null,
          }))}
          activeId={place?.id ?? null}
          newLabel={newLabel}
          onNewLabel={setNewLabel}
          onCaptureHere={captureHere}
          onSwitch={(id) => {
            const row = places.find((p) => p.id === id);
            void setActivePlace(id).then(() => toast.success(vantaSay.switchedPlace(row?.label ?? "that place")));
          }}
          archived={archivedPlaces}
          onArchive={async (id, label) => {
            await archiveRecord("place", id, { label });
            await loadList();
            toast.success({ title: "Archived.", description: `${label} is off the desk. The record stays in Receipts.` });
          }}
          onRestore={async (id, label) => {
            await restoreRecord("place", id, { label });
            await loadList();
            toast.success({ title: "Back on the desk.", description: `${label} is a live pin again.` });
          }}
          onDelete={async (id, label) => {
            if (!confirm(`Delete "${label}"?`)) return;
            await deletePlace(id);
            await loadList();
            toast.success(vantaSay.placeDeleted());
          }}
        />

        <NearbyPlacesPanel
          rows={[
            ...nearbyTowns.map((t) => ({
              key: `town:${t.name}`,
              name: t.name,
              localName: t.localName,
              detail: t.kind ? `${t.kind}, from map data.` : null,
              distanceM: t.distanceM,
              source: "map" as const,
            })),

            ...(((snapshot?.full_data as any)?.local_signals ?? []) as Array<{ title?: string; snippet?: string; kind?: string; distance_m?: number }>)
              .filter((s) => s.kind === "place" && s.title)
              .map((s) => ({
                key: `venue:${s.title}`,
                name: String(s.title),
                detail: s.snippet ?? null,
                distanceM: Number.isFinite(Number(s.distance_m)) ? Number(s.distance_m) : null,
                source: "scan" as const,
              })),
          ]}
          scanLine={sentenceCase(freshLabel(generatedAt ?? null))}
          scanning={snapshotLoading}
          onScan={() => refreshSnapshot(true)}
        />

        {/* Trips — deliberate start and end, and what you've covered. */}
        <FieldSessionCard variant="aware" />

        <TripHistoryPanel />
        </> : null}

        {/* L5 — Tier-aware Scan button. Explicit, never auto-fires. */}
        {place && (() => {
          const tier = classifyTier(place);
          const scan = tierScanCopy(tier, { serpEnabled: controls?.serpapi_enabled });
          return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/30 px-3 py-2 text-[12px]">
              <Button
                size="sm"
                className="h-10 gap-1 text-[12px] min-w-[7rem]"
                disabled={scan.disabled || snapshotLoading}
                onClick={() => refreshSnapshot(true)}
                title={scan.helper}
              >
                {snapshotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {snapshotLoading ? "Scanning…" : scan.buttonLabel}
              </Button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] text-foreground/85">{scan.helper}</span>
                <span className="text-[11px] text-muted-foreground">{scan.sourceImpact}</span>
              </div>
            </div>
          );
        })()}

        {showMore && (<div className="space-y-4">
        <WhatVantaSees className="mt-4" />

        {/* HUD: radar hero — hidden by default on mobile, expandable. */}
        {(!isMobile || showRadar) ? (
          <div className="relative">
            <AwarenessHUD variant="hero" activeLayer={activeLayer} />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated/70 text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                  aria-label="What am I seeing?"
                  title="What am I seeing?"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-[11.5px] leading-relaxed">
                <div className="font-medium text-foreground mb-1">What am I seeing?</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li><span className="text-foreground/85">Pings</span> = real data (source or layer briefing).</li>
                  <li><span className="text-foreground/85">Ring distance</span> = how fresh (closer = newer).</li>
                  <li><span className="text-foreground/85">Layer chips</span> = filter pings to one slice.</li>
                  <li><span className="text-foreground/85">Terrain</span> = backdrop changes by water / urban / region.</li>
                  <li>Tap any chip → quick read. "View full detail" → bottom sheet.</li>
                </ul>
              </PopoverContent>
            </Popover>
            {isMobile && (
              <div className="mt-1 text-right">
                <button
                  type="button"
                  onClick={() => setShowRadar(false)}
                  className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Hide radar
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowRadar(true)}
            className="w-full rounded-xl border border-dashed border-border/60 bg-surface-elevated/20 px-3 py-2 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Show radar
          </button>
        )}



        {/* Layer chips — tap = filter the radar; drawer is "view full detail" */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Layers</span>
            {activeLayer && (
              <button
                type="button"
                onClick={() => setActiveLayer(null)}
                className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> All layers
              </button>
            )}
          </div>
          <LayerChips
            activeLayer={activeLayer}
            onPick={(s) => setActiveLayer((cur) => (cur === s ? null : s))}
          />

          {activeLayer === "terrain" ? (
            <div className="mt-2 rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-accent">terrain</span>
                <button
                  type="button"
                  onClick={() => setActiveLayer(null)}
                  className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <p className="text-[12px] leading-snug text-foreground/85">
                {terrainModeCaption(terrainModeFor(place), place, isMobile)}
              </p>
            </div>
          ) : activeLayer && (() => {
            const b = latestBySection[activeLayer];
            const busy = generating === activeLayer;
            return (
              <div className="mt-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-primary capitalize">
                    {activeLayer}
                  </span>
                  <div className="flex items-center gap-2">
                    {b && (
                      <button
                        type="button"
                        onClick={() => openSection(activeLayer)}
                        className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        View full detail
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveLayer(null)}
                      className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {b ? (
                  <SignalCard
                    signal={normalizeAwarenessSignal(activeLayer, b, { place, compact: isMobile })}
                    generatedAt={b.generated_at}
                    onRoute={onSignalRoute}
                    compact
                  />
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-muted-foreground">
                      No read for this layer yet. Tap <span className="font-medium text-foreground/80">Scan layer</span> to assemble one.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[11px] shrink-0"
                      disabled={busy || !place}
                      onClick={() => generate(activeLayer)}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Scan layer
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

        </div>

        {/* Saved places and nearby ground are first-class panels above — the
            workings hold only the radar and layers now. */}
        </div>)}
      </div>

      <SectionDrawer
        section={drawerSection}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <SurfaceAftermath surface="awareness" />
    </div>
  );
}
