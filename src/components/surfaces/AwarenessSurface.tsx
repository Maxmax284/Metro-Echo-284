import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, RefreshCcw, Sparkles, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { AWARENESS_SECTIONS, useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { AwarenessHUD } from "@/components/shell/AwarenessHUD";
import { SignalCard } from "@/components/awareness/SignalCard";
import { useSignalRoute } from "@/lib/useSignalRoute";

export function AwarenessSurface() {
  const { session } = useAuth();
  const { place: activePlaceFromProvider, latestBySection, loading, generate, generating, refresh } = useAwareness();
  const onSignalRoute = useSignalRoute();
  const [places, setPlaces] = useState<AwarenessPlace[]>([]);
  const [activePlace, setActivePlace] = useState<AwarenessPlace | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const loadList = async () => {
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at")
      .order("updated_at", { ascending: false });
    setPlaces((data ?? []) as AwarenessPlace[]);
  };

  useEffect(() => { if (session) loadList(); }, [session, activePlaceFromProvider?.id]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Awareness</h2>
        <p className="text-xs text-muted-foreground">
          Operational context for where you are. Confidence labels included; not safety, legal, or medical advice.
        </p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {/* HUD: live radar pinned to the active place */}
        <AwarenessHUD />

        {/* Quick-generate row — bones for batch briefing actions */}
        {activePlaceFromProvider && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
              Quick generate
            </span>
            {AWARENESS_SECTIONS.map((s) => {
              const has = !!latestBySection[s];
              const busy = generating === s;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={has ? "outline" : "secondary"}
                  disabled={busy}
                  onClick={() => generate(s)}
                  className="h-7 gap-1 text-[11px] capitalize"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> :
                    has ? <RefreshCcw className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  {s}
                </Button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Input placeholder="Place label (optional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button onClick={captureHere} className="gap-1 shrink-0">
            <MapPin className="h-4 w-4" /> Use here
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : places.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No places yet. Tap "Use here" to capture this location.
          </div>
        ) : (
          <ul className="space-y-2">
            {places.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setActivePlace(p)}
                  className="block w-full rounded-xl surface-elevated p-3 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary/80" />
                    <span className="text-sm font-medium">{p.label}</span>
                    {activePlaceFromProvider?.id === p.id && (
                      <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary ring-1 ring-primary/30">
                        active
                      </span>
                    )}
                  </div>
                  {p.geo && (
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {Number(p.geo.lat).toFixed(3)}, {Number(p.geo.lon).toFixed(3)}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activePlace && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/60 backdrop-blur-sm md:items-center" onClick={() => setActivePlace(null)}>
          <div
            className="m-0 max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl glass p-5 md:m-4 md:rounded-2xl animate-slide-up scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{activePlace.label}</h3>
              <button onClick={() => setActivePlace(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {AWARENESS_SECTIONS.map((s) => {
                // Only show briefings from provider when this is the active place
                const b = activePlaceFromProvider?.id === activePlace.id ? latestBySection[s] : undefined;
                const busy = generating === s && activePlaceFromProvider?.id === activePlace.id;
                const sameActive = activePlaceFromProvider?.id === activePlace.id;
                return (
                  <div key={s} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium capitalize">{s}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !sameActive}
                        onClick={() => generate(s)}
                        className="gap-1"
                        title={!sameActive ? "Briefings only for the most recent place in this stage" : undefined}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                          b ? <RefreshCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {b ? "Refresh" : "Generate"}
                      </Button>
                    </div>
                    {b ? (
                      <SignalCard
                        signal={b.signal ?? { title: s, short_summary: b.content, confidence: b.confidence ?? "low" }}
                        fallbackBody={b.content}
                        generatedAt={b.generated_at}
                        onRoute={onSignalRoute}
                      />
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/60 p-3 text-[12.5px] text-muted-foreground">
                        No briefing yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
