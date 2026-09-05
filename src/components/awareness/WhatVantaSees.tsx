// What Vanta can see — one honest list of the senses and feeds, built from the
// consent switches and the recorded source health. Each row says on or off,
// what it helps with, and — where there is a recorded moment — when it last
// had something to say.
//
// Location is the row that used to lie: the room could read a place off a pin
// while this list said "off". Now the row says both halves out loud — whether
// live location is allowed, and what the room is actually working from — and
// it offers the switch here instead of sending you hunting for it.
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSourceHealth } from "@/hooks/useSourceHealth";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth, type PlaceLike } from "@/lib/placeTruth";
import { Button } from "@/components/ui/button";
import { vantaToast as toast } from "@/lib/vantaVoice";
import type { SourceHealth } from "@/lib/sourceHealth";
import { capabilityStatusLine, type SenseRow } from "@/lib/capabilityStatus";

/** One row of the senses list. Shape shared with the Telegram answer. */
type Row = SenseRow & { stateWord?: string };

function feedState(sources: SourceHealth[], key: string): boolean | null {
  const s = sources.find((x) => x.key === key);
  if (!s) return null;
  return s.state !== "off" && s.state !== "no_data";
}

function feedMissing(sources: SourceHealth[], key: string): boolean {
  return !sources.some((x) => x.key === key);
}

function feedProof(sources: SourceHealth[], key: string): string | null {
  const s = sources.find((x) => x.key === key);
  if (!s) return null;
  return s.proof || null;
}

export function WhatVantaSees({ className }: { className?: string }) {
  const { prefs, update } = useUserPreferences();
  const { sources } = useSourceHealth();
  const { place } = useAwareness();
  const navigate = useNavigate();
  const consent = (prefs.sensor_consent ?? {}) as Record<string, boolean>;

  const locationAllowed = consent.location === true;
  const truth = placeTruth((place ?? null) as PlaceLike | null);
  const workingFrom = place
    ? truth.setByYou
      ? `Right now the room is working from a pin you placed${truth.name ? ` in ${truth.name}` : ""}.`
      : `Right now the room is working from ${truth.name ?? place.label}${truth.age ? `, fixed ${truth.age}` : ""}.`
    : "No place set, so the room has nothing to read from.";

  /* Turning it on here does two things: records that you allow it, and asks the
     phone for one fix so the switch means something immediately. */
  const turnLocationOn = async () => {
    await update({ sensor_consent: { ...consent, location: true } });
    if (!navigator.geolocation) {
      toast("Location is allowed now. This device won't share a fix, so set your place by hand.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => toast.success("Location is on. Tap Recenter and Vanta will use this spot."),
      () => toast("Location is allowed in Vanta, but your phone still refused. Allow it for this site in your browser settings."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const rows: Row[] = [
    {
      label: "Location",
      on: locationAllowed,
      stateWord: locationAllowed ? "on" : place ? "off — using the place you set" : "off",
      helps: "Timing and travel context — city-level, never a live trail.",
      detail: workingFrom,
    },
    {
      label: "Calendar",
      on: feedState(sources, "calendar"),
      unset: feedMissing(sources, "calendar"),
      helps: "The shape of your day, read-only. Nothing gets moved or answered.",
      detail: feedProof(sources, "calendar"),
    },
    {
      label: "Telegram",
      on: feedState(sources, "telegram"),
      unset: feedMissing(sources, "telegram"),
      helps: "Messages, photos and voice notes arrive as captures. Nothing sends without you.",
      detail: feedProof(sources, "telegram"),
    },
    {
      label: "Wearable",
      on: feedState(sources, "wearable"),
      unset: feedMissing(sources, "wearable"),
      helps: "Readings your watch shares, so Vanta can notice a hard week.",
      detail: feedProof(sources, "wearable"),
    },
    {
      label: "Camera",
      on: null,
      helps: "Only when you tap to show Vanta something. It never looks on its own.",
    },
    {
      label: "Microphone",
      on: consent.microphone === true,
      helps: "Only while you hold record. Nothing listens in the background.",
    },
  ];

  return (
    <section className={className} aria-label="What Vanta can see">
      <div className="vanta-card rounded-xl p-3">
        <div className="text-[12px] font-semibold">What Vanta can see</div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{capabilityStatusLine(rows)}</p>
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-2">
              {r.on === true ? (
                <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <div className="min-w-0">
                <span className="text-[11.5px] font-medium">
                  {r.label} — {r.stateWord ?? (r.unset ? "not set up yet" : r.on === null ? "by request" : r.on ? "on" : "off")}
                </span>
                <p className="text-[11px] leading-snug text-muted-foreground">{r.helps}</p>
                {r.detail ? (
                  <p className="text-[10.5px] leading-snug text-muted-foreground/70">{r.detail}</p>
                ) : null}
                {r.label === "Location" && !locationAllowed ? (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <Button size="sm" className="h-9 text-[12px]" onClick={turnLocationOn}>
                      Turn location on
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-[12px]"
                      onClick={() => navigate("/awareness/location")}
                    >
                      Set where I am
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-9 w-full gap-1.5 text-[12px]"
          onClick={() => navigate("/settings/g/awareness")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Change what Vanta may sense
        </Button>
      </div>
    </section>
  );
}
