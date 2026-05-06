import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, RefreshCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

type Place = { id: string; label: string; geo: any; country: string | null; region: string | null };
type Briefing = { id: string; section: string; content: string; confidence: string | null; generated_at: string };

const SECTIONS = ["transport", "infrastructure", "payments", "etiquette", "hazards", "scams", "connectivity", "timing"];

export function AwarenessSurface() {
  const { session } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [activePlace, setActivePlace] = useState<Place | null>(null);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.from("awareness_places").select("*").order("updated_at", { ascending: false });
    setPlaces((data ?? []) as Place[]);
    setLoading(false);
  };

  useEffect(() => { if (session) refresh(); }, [session]);

  useEffect(() => {
    if (!activePlace) return;
    (async () => {
      const { data } = await supabase
        .from("awareness_briefings")
        .select("id, section, content, confidence, generated_at")
        .eq("place_id", activePlace.id)
        .order("generated_at", { ascending: false });
      setBriefings((data ?? []) as Briefing[]);
    })();
  }, [activePlace]);

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
          .select("*")
          .single();
        if (data) {
          setNewLabel("");
          setPlaces((p) => [data as Place, ...p]);
        }
      },
      () => toast.error("Couldn't get location"),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const generate = async (section: string) => {
    if (!activePlace) return;
    setGenerating(section);
    try {
      const { error } = await supabase.functions.invoke("awareness-brief", {
        body: { place_id: activePlace.id, section },
      });
      if (error) throw error;
      const { data } = await supabase
        .from("awareness_briefings")
        .select("id, section, content, confidence, generated_at")
        .eq("place_id", activePlace.id)
        .order("generated_at", { ascending: false });
      setBriefings((data ?? []) as Briefing[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Briefing failed");
    } finally {
      setGenerating(null);
    }
  };

  const latestBy = new Map<string, Briefing>();
  for (const b of briefings) if (!latestBy.has(b.section)) latestBy.set(b.section, b);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Awareness</h2>
        <p className="text-xs text-muted-foreground">
          Operational context for where you are. Confidence labels included; not safety, legal, or medical advice.
        </p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
        <div className="mb-4 flex gap-2">
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
              {SECTIONS.map((s) => {
                const b = latestBy.get(s);
                return (
                  <div key={s} className="rounded-xl surface-elevated p-3 ring-1 ring-border/60">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium capitalize">{s}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={generating === s}
                        onClick={() => generate(s)}
                        className="gap-1"
                      >
                        {generating === s ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                          b ? <RefreshCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {b ? "Refresh" : "Generate"}
                      </Button>
                    </div>
                    {b ? (
                      <div className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/90">
                        {b.content}
                        {b.confidence && (
                          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                            confidence: {b.confidence}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12.5px] text-muted-foreground">No briefing yet.</p>
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
