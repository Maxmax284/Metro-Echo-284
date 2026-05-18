import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Crosshair, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { AwarenessHUD } from "@/components/shell/AwarenessHUD";
import { LayerChips } from "@/components/awareness/LayerChips";
import { SectionDrawer } from "@/components/awareness/SectionDrawer";
import { AttentionQueue } from "@/components/awareness/AttentionQueue";
import { SignalCard } from "@/components/awareness/SignalCard";
import { useSignalRoute } from "@/lib/useSignalRoute";
import { CONFIDENCE_TONE } from "@/lib/vantaSignal";
import { normalizeAwarenessSignal } from "@/lib/awarenessPlainTalk";
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
  const { place, overall, refresh, snapshot, latestBySection, generate, generating } = useAwareness();
  const onSignalRoute = useSignalRoute();
  const [places, setPlaces] = useState<AwarenessPlace[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [drawerSection, setDrawerSection] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [recentering, setRecentering] = useState(false);

  const loadList = async () => {
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at")
      .order("updated_at", { ascending: false });
    setPlaces((data ?? []) as AwarenessPlace[]);
  };

  useEffect(() => { if (session) loadList(); }, [session, place?.id]);

  const openSection = (section: string) => {
    setDrawerSection(section);
    setDrawerOpen(true);
  };

  const captureHere = async () => {
    if (!session || !navigator.geolocation) {
      toast.error("Location not available");
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
          await refresh();
        }
      },
      () => toast.error("Couldn't get location"),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const recenter = () => {
    if (!session || !place) {
      toast.error("No active place to recenter on.");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("This browser can't read location. Pick a saved place instead.");
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
          toast.error("Couldn't save the new location.");
          return;
        }
        if (acc && acc > 5000) {
          toast(`Got a rough fix (±${Math.round(acc / 1000)}km). Confirm the place if it looks wrong.`);
        } else {
          toast.success("Recentered. Tap Scan area when you want fresh context.");
        }
        await refresh();
      },
      (err) => {
        setRecentering(false);
        if (err.code === 1) {
          toast.error("Location permission is off. Enable it in your browser or pick a saved place.");
        } else if (err.code === 2) {
          toast.error("Location unavailable right now. Try again or pick a saved place.");
        } else if (err.code === 3) {
          toast.error("Location timed out. Try again in a moment.");
        } else {
          toast.error("Couldn't read your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const confTone = overall.confidence ? CONFIDENCE_TONE[overall.confidence] : "bg-muted/40 text-muted-foreground ring-border/60";
  const generatedAt = snapshot?.generated_at ?? overall.newest_at;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Awareness</h2>
        <p className="text-xs text-muted-foreground">
          Operational context for where you are. Confidence labels included; not safety, legal, or medical advice.
        </p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {/* Place strip — answers "where am I, how sure, how fresh" */}
        {place && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2 text-[12px]">
            <span className="inline-flex items-center gap-1 text-foreground/90">
              <MapPin className="h-3.5 w-3.5 text-primary/80" />
              <span className="font-medium">{place.label}</span>
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1", confTone)}>
              {overall.confidence ?? "no signal"}
            </span>
            <span
              className="text-[10.5px] lowercase tracking-wide text-muted-foreground"
              title={generatedAt ? new Date(generatedAt).toLocaleString() : "No scan recorded yet"}
            >
              {freshLabel(generatedAt)}
            </span>
            <SourceStatusPill />
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={recenter}
                disabled={recentering}
                title="Update this place to your current GPS location"
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-elevated/60 disabled:opacity-60"
              >
                {recentering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                Recenter
              </button>
              <button
                type="button"
                onClick={() => setShowPlaces((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {showPlaces ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Switch place
              </button>
            </div>
          </div>
        )}

        {/* HUD: radar hero — receives active layer for ping filtering */}
        <AwarenessHUD variant="hero" activeLayer={activeLayer} />

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

          {activeLayer && (() => {
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
                    signal={normalizeAwarenessSignal(activeLayer, b, { place })}
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
                {places.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2">
                      <MapPin className="h-4 w-4 text-primary/80" />
                      <span className="text-sm font-medium">{p.label}</span>
                      {place?.id === p.id && (
                        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary ring-1 ring-primary/30">
                          active
                        </span>
                      )}
                    </div>
                  </li>
                ))}
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
