import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Crosshair, Loader2, MapPin, Sparkles, Wrench, X } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { AwarenessHUD } from "@/components/shell/AwarenessHUD";
import { LayerChips } from "@/components/awareness/LayerChips";
import { SectionDrawer } from "@/components/awareness/SectionDrawer";
import { AttentionQueue } from "@/components/awareness/AttentionQueue";
import { SignalCard } from "@/components/awareness/SignalCard";
import { BadLocationRecoveryPanel } from "@/components/awareness/BadLocationRecoveryPanel";
import { classifyPlaceBadness } from "@/lib/locationSanity";
import { useSignalRoute } from "@/lib/useSignalRoute";
import { CONFIDENCE_TONE } from "@/lib/vantaSignal";
import { normalizeAwarenessSignal, classifyTier, tierScanCopy, terrainModeFor, terrainModeCaption, type LocationTier } from "@/lib/awarenessPlainTalk";
import { useIsMobile } from "@/hooks/use-mobile";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useSystemControls } from "@/hooks/useSystemControls";
import { SourceStatusPill } from "@/components/awareness/SourceStatusPill";
import { cn } from "@/lib/utils";

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

export function AwarenessSurface() {
  const { session } = useAuth();
  const { place, overall, refresh, snapshot, snapshotLoading, refreshSnapshot, latestBySection, generate, generating, setActivePlace, deletePlace } = useAwareness();
  const isMobile = useIsMobile();
  const { controls } = useSystemControls();
  const onSignalRoute = useSignalRoute();
  const [places, setPlaces] = useState<AwarenessPlace[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [drawerSection, setDrawerSection] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [recentering, setRecentering] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  // Watch for country null → set transition to offer a rescan prompt + auto-fire snapshot once.
  const prevCountryRef = useRef<string | null | undefined>(undefined);
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
    prevCountryRef.current = place.country ?? null;
  }, [place?.id, place?.country, refreshSnapshot]);

  const loadList = async () => {
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at")
      .order("updated_at", { ascending: false });
    setPlaces((data ?? []) as AwarenessPlace[]);
  };

  useEffect(() => { if (session) loadList(); }, [session, place?.id]);

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
        const { data } = await supabase
          .from("awareness_places")
          .insert({
            user_id: session.user.id,
            label,
            geo: { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy },
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
        const { error } = await supabase
          .from("awareness_places")
          .update({
            geo: { lat: pos.coords.latitude, lon: pos.coords.longitude, acc },
            updated_at: new Date().toISOString(),
          })
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

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden">
      <div className="px-4 pt-3 pb-2 min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">Awareness</h2>
        <p className="text-xs text-muted-foreground break-words">
          Operational context for where you are. Confidence labels included; not safety, legal, or medical advice.
        </p>
      </div>

      <div className="scrollbar-thin flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-36 md:pb-24 safe-bottom space-y-4">
        {/* Place strip — sticky on mobile. Two clean lines. Extra chips in More. */}
        {place && (() => {
          const tier = classifyTier(place);
          const TONE: Record<LocationTier, string> = {
            exact:   "bg-primary/15 text-primary ring-primary/40",
            saved:   "bg-primary/10 text-primary ring-primary/30",
            area:    "bg-accent/15 text-accent ring-accent/40",
            city:    "bg-accent/10 text-accent ring-accent/30",
            country: "bg-warn/15 text-warn ring-warn/40",
            unknown: "bg-muted/40 text-muted-foreground ring-border/60",
          };
          return (
            <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none md:mx-0 md:p-0">
              <div className="rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2 space-y-1.5">
                {/* Line 1 — identity */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                  <span className="font-medium text-[12px] text-foreground/90 truncate">{place.label}</span>
                  <span
                    title={`Tier: ${tier.tier} — ${tier.display}`}
                    className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1 shrink-0", TONE[tier.tier])}
                  >
                    {tier.tier}
                  </span>
                  <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1 shrink-0", confTone)}>
                    {overall.confidence ?? "no signal"}
                  </span>
                </div>

                {/* Line 2 — status line */}
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {badness.bad
                    ? <span className="text-warn">{badness.headline}</span>
                    : freshLabel(generatedAt)}
                </div>

                {/* Line 3 — primary action */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {badness.bad ? (
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-1 text-[12px] text-muted-foreground shrink-0"
                    onClick={() => setShowPlaces((v) => !v)}
                  >
                    {showPlaces ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Switch
                  </Button>
                  <div className="shrink-0"><SourceStatusPill /></div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Bad Location Recovery — primary path when pin is unusable. */}
        {place && badness.bad && recoveryOpen && (
          <BadLocationRecoveryPanel
            alternatives={alternatives}
            onDismiss={() => { setRecoveryOpen(false); setRecoveryDismissed(true); }}
          />
        )}

        {/* L5 — Tier-aware Scan button. Explicit, never auto-fires. */}
        {place && (() => {
          const tier = classifyTier(place);
          const scan = tierScanCopy(tier, { serpEnabled: controls?.serpapi_enabled });
          return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/30 px-3 py-2 text-[12px]">
              <Button
                size="sm"
                className="h-8 gap-1 text-[11.5px]"
                disabled={scan.disabled || snapshotLoading}
                onClick={() => refreshSnapshot(true)}
                title={scan.helper}
              >
                {snapshotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {snapshotLoading ? "Scanning…" : scan.buttonLabel}
              </Button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11.5px] text-foreground/85">{scan.helper}</span>
                <span className="text-[10.5px] text-muted-foreground">{scan.sourceImpact}</span>
              </div>
            </div>
          );
        })()}

        {/* HUD: radar hero — receives active layer for ping filtering */}
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
        </div>


        {/* Attention queue — derived, never alarmist */}
        <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Attention</div>
          <AttentionQueue onOpenSection={openSection} />
        </div>

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

        {/* Places list — collapsed by default */}
        {(showPlaces || !place) && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Place label (optional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              <Button onClick={captureHere} className="gap-1 shrink-0">
                <MapPin className="h-4 w-4" /> Use here
              </Button>
            </div>
            {places.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No places yet. Tap "Use here" to capture this location.
              </div>
            ) : (
              <ul className="space-y-2">
                {places.map((p) => {
                  const isActive = place?.id === p.id;
                  const pBad = classifyPlaceBadness(p as any).bad;
                  return (
                    <li key={p.id}>
                      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2">
                        <MapPin className="h-4 w-4 text-primary/80 shrink-0" />
                        <button
                          onClick={() => !isActive && setActivePlace(p.id).then(() => toast.success(vantaSay.switchedPlace(p.label)))}
                          className="text-left text-sm font-medium truncate hover:text-primary"
                          disabled={isActive}
                        >
                          {p.label}
                        </button>
                        {pBad && (
                          <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-warn ring-1 ring-warn/30">
                            unresolved
                          </span>
                        )}
                        {isActive && (
                          <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary ring-1 ring-primary/30">
                            active
                          </span>
                        )}
                        {!isActive && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete "${p.label}"?`)) return;
                              await deletePlace(p.id);
                              toast.success(vantaSay.placeDeleted());
                            }}
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            title="Delete place"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <SectionDrawer
        section={drawerSection}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
