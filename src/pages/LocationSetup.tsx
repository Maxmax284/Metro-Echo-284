// Location setup — the page that answers "how do I turn this on?"
//
// It says what state location is in, both halves: whether you allow Vanta to
// use it, and whether the browser will actually hand a fix over. Then it gives
// exactly two ways to be somewhere: take a real fix from this device, or set
// the pin yourself on the map. Nothing here runs on its own.
import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Crosshair, Loader2, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { placeTruth, placeSourceBadge, type PlaceLike } from "@/lib/placeTruth";
import { AwarenessMapPanel } from "@/components/awareness/AwarenessMapPanel";
import { MapPickerDialog } from "@/components/awareness/MapPickerDialog";
import {
  FIX_FAILURE_COPY,
  fixQualityLine,
  readLocationPermission,
  recordDeviceFix,
  requestFix,
  type PermissionRead,
  type PlaceRow,
} from "@/lib/locationSource";

const PERMISSION_COPY: Record<PermissionRead, string> = {
  granted: "Your browser will hand a fix over when Vanta asks.",
  denied: "Your browser is refusing location for this site. Change it in the site settings, then come back.",
  prompt: "Your browser hasn't been asked yet. It will ask the first time you take a fix.",
  unsupported: "This device won't share location at all, so set your place on the map instead.",
};

export default function LocationSetupPage() {
  const { session, loading: authLoading } = useAuth();
  const { place, refresh, setActivePlace, deletePlace } = useAwareness();
  const { prefs, update } = useUserPreferences();
  const navigate = useNavigate();

  const [permission, setPermission] = useState<PermissionRead>("prompt");
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [taking, setTaking] = useState(false);
  const [label, setLabel] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const consent = (prefs.sensor_consent ?? {}) as Record<string, boolean>;
  const allowed = consent.location === true;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at")
      .order("updated_at", { ascending: false });
    setPlaces((data ?? []) as PlaceRow[]);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
    void readLocationPermission().then(setPermission);
  }, [session, load, place?.id]);

  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  const truth = placeTruth((place ?? null) as PlaceLike | null);

  const takeFix = async () => {
    setTaking(true);
    try {
      if (!allowed) await update({ sensor_consent: { ...consent, location: true } });
      const res = await requestFix();
      setPermission(await readLocationPermission());
      if (!("fix" in res)) {
        toast.error(FIX_FAILURE_COPY[res.failure]);
        return;
      }
      const rec = await recordDeviceFix({
        userId: session.user.id,
        fix: res.fix,
        places,
        label,
      });
      setLabel("");
      await setActivePlace(rec.placeId);
      await refresh();
      await load();
      const named = rec.place?.label ?? rec.label;
      toast.success({
        title: rec.moved ? `You're at ${named} — Vanta moved that pin` : `Set to ${named}`,
        description: fixQualityLine(res.fix.acc),
      });
    } catch (err) {
      console.error("[location] fix failed", err);
      toast.error("Couldn't save that place. Try again in a moment.");
    } finally {
      setTaking(false);
    }
  };

  const toggleAllowed = async (next: boolean) => {
    await update({ sensor_consent: { ...consent, location: next } });
    if (!next) {
      toast("Location is off. Vanta will only use the place you set by hand.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <header className="mb-5 flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate("/?surface=awareness")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Where you are</h1>
          <p className="text-sm text-muted-foreground">
            Vanta uses your place for timing and travel wording only. It never keeps a live trail, and it never
            shares where you are.
          </p>
        </div>
      </header>

      {/* State — both halves, out loud. */}
      <section className="vanta-card rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Let Vanta use this device's location</div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {allowed ? "On." : "Off."} {PERMISSION_COPY[permission]}
            </p>
          </div>
          <Switch checked={allowed} onCheckedChange={toggleAllowed} aria-label="Allow location" />
        </div>

        <p className="mt-3 text-[11.5px] leading-snug text-foreground/85">
          {place
            ? `Right now the room is working from ${truth.name ?? place.label}${truth.age ? `, fixed ${truth.age}` : ""}. ${placeSourceBadge(truth)}.`
            : "No place set yet, so the room has nothing to read from."}
        </p>

        <div className="mt-3 space-y-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name this spot (optional) — Lamai gym, home, office"
            className="h-10"
          />
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 gap-1.5" onClick={takeFix} disabled={taking}>
              {taking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              Use this device
            </Button>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setPickerOpen(true)}>
              <MapPin className="h-4 w-4" />
              Set it on the map
            </Button>
          </div>
        </div>
      </section>

      <AwarenessMapPanel className="mt-4" places={places as any} onMoved={() => void load()} />

      <section className="mt-4">
        <h2 className="mb-2 text-[13px] font-semibold">Places you've saved</h2>
        {places.length === 0 ? (
          <p className="vanta-card rounded-xl p-3 text-[11.5px] leading-snug text-muted-foreground">
            Nothing saved yet. Take a fix here or drop a pin, and the spot stays on this list so you can come
            back to it without asking the phone again.
          </p>
        ) : (
          <ul className="space-y-2">
            {places.map((p) => {
              const t = placeTruth(p as PlaceLike);
              const active = place?.id === p.id;
              return (
                <li key={p.id} className="vanta-card flex items-start gap-2 rounded-xl p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium">
                      {p.label}
                      {active ? <span className="ml-1.5 text-[10.5px] text-primary">where you are now</span> : null}
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {[t.name, placeSourceBadge(t), t.age ? `fixed ${t.age}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {!active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-[12px]"
                      onClick={async () => {
                        await setActivePlace(p.id);
                        await refresh();
                        toast.success(`Vanta is reading from ${p.label} now.`);
                      }}
                    >
                      I'm here
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label={`Forget ${p.label}`}
                    onClick={async () => {
                      await deletePlace(p.id);
                      await load();
                      toast("Forgotten. Nothing else changed.");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MapPickerDialog
        open={pickerOpen}
        onOpenChange={(v) => {
          setPickerOpen(v);
          if (!v) void load();
        }}
        initial={(() => {
          const g = (place?.geo ?? {}) as any;
          return Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon))
            ? { lat: Number(g.lat), lon: Number(g.lon) }
            : undefined;
        })()}
      />
    </div>
  );
}
