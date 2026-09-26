import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown, ChevronRight, Loader2, MapPin, Radar, Sparkles, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useSystemControls } from "@/hooks/useSystemControls";
import { SourceStatusPill } from "@/components/awareness/SourceStatusPill";
import { classifyTier, type LocationTier } from "@/lib/awarenessPlainTalk";
import { CONFIDENCE_TONE } from "@/lib/vantaSignal";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";

type Props = {
  className?: string;
  onOpenAwareness?: () => void;
};

const TIER_TONE: Record<LocationTier, string> = {
  exact:   "bg-primary/15 text-primary ring-primary/40",
  saved:   "bg-primary/10 text-primary ring-primary/30",
  area:    "bg-accent/15 text-accent ring-accent/40",
  city:    "bg-accent/10 text-accent ring-accent/30",
  country: "bg-warn/15 text-warn ring-warn/40",
  unknown: "bg-muted/40 text-muted-foreground ring-border/60",
};

const TIER_LABEL: Record<LocationTier, string> = {
  exact: "GPS",
  saved: "Saved",
  area: "Area",
  city: "City",
  country: "Country",
  unknown: "Unknown",
};

/**
 * AwareCockpitCard — compact Aware status tile for the Cockpit only.
 * Reads from the same Awareness state as the Aware tab; never duplicates it.
 * Shows: place, tier, confidence, source state, one context line, scan + open.
 */
export function AwareCockpitCard({ className, onOpenAwareness }: Props) {
  const { place, snapshot, snapshotLoading, refreshSnapshot, overall } = useAwareness();
  const { controls } = useSystemControls();
  const [tempUnit] = useTempUnit();

  // Aware bubble is seasoning, not the meal. Collapsed by default; remembered
  // per device. The full Aware tab remains the deep intelligence room.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("vanta.aware.expanded") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vanta.aware.expanded", expanded ? "1" : "0");
    }
  }, [expanded]);

  const tier = useMemo(() => classifyTier(place), [place]);
  const weather = snapshot?.compact?.weather;
  const generated = snapshot?.generated_at;
  const confTone = overall.confidence
    ? CONFIDENCE_TONE[overall.confidence]
    : "bg-muted/40 text-muted-foreground ring-border/60";

  // Empty / unknown place
  if (!place) {
    return (
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Radar className="h-3.5 w-3.5" /> Aware — no place yet
          </span>
          {onOpenAwareness && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={onOpenAwareness}>
              <MapPin className="h-3 w-3" /> Set place
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Action labels keyed to tier (no robotic copy)
  const scopeName = tier.city ?? tier.region ?? tier.country ?? "this area";
  let primaryLabel = `Scan ${scopeName}`;
  let primaryHelper = "";
  let disabled = false;
  if (tier.tier === "exact")        { primaryLabel = "Scan this spot"; }
  else if (tier.tier === "saved")   { primaryLabel = "Scan saved place"; }
  else if (tier.tier === "country") { primaryLabel = `Scan ${tier.country} context`; }
  else if (tier.tier === "unknown") { primaryLabel = "Confirm place first"; disabled = true; }
  else if (tier.tier === "city" && tier.region && tier.city) {
    primaryHelper = `Uses broader ${tier.region} data if local signals are thin.`;
  }

  // One-line context (no paragraphs)
  let contextLine = "";
  if (!generated) contextLine = "No scan yet. Scan when you want local context.";
  else if (tier.tier === "city" || tier.tier === "area")
    contextLine = `Using broader ${tier.region ?? tier.country ?? "regional"} context until a local scan runs.`;
  else if (tier.tier === "country") contextLine = "Country-level read. Confirm a place for sharper results.";
  else if (tier.tier === "saved")   contextLine = `Using saved place: ${place.label}.`;
  else if (tier.tier === "exact")   contextLine = "Using GPS location.";

  // Override: if external search errored, prefer the soft notice
  const serpError = !!(snapshot?.full_data && (snapshot.full_data as any)?.errors?.serpapi);
  if (serpError) contextLine = "Some sources failed. Open Aware for details.";

  // Collapsed one-liner: place · tier · source · open. Stays out of the way.
  if (!expanded) {
    return (
      <Card className={cn("border-border/60 bg-surface-elevated/40 px-3 py-2", className)}>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-foreground/85 hover:text-foreground"
            aria-label="Expand Aware"
          >
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Radar className="h-3.5 w-3.5 shrink-0 text-primary/80" />
            <span className="truncate font-medium">{place.label}</span>
            <span className="shrink-0 text-muted-foreground">·</span>
            <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {TIER_LABEL[tier.tier]}
            </span>
            {generated ? (
              <>
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">cached</span>
              </>
            ) : null}
          </button>
          {onOpenAwareness && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onOpenAwareness}
            >
              Open Aware <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("border-border/60 bg-surface-elevated/40 p-3 space-y-2", className)}>
      {/* Header row — title + chips + collapse */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 text-foreground/90 hover:text-foreground"
          aria-label="Collapse Aware"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Radar className="h-3.5 w-3.5 text-primary/80" />
          <span className="font-medium">Aware</span>
        </button>
        <span className="inline-flex items-center gap-1 text-foreground/85">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span className="truncate max-w-[140px]">{place.label}</span>
        </span>
        <span
          className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1", TIER_TONE[tier.tier])}
          title={tier.display}
        >
          {TIER_LABEL[tier.tier]}
        </span>
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1", confTone)}>
          {overall.confidence ?? "no signal"}
        </span>
        <SourceStatusPill />
      </div>

      {contextLine && (
        <p className="text-[12px] leading-snug text-foreground/75">{contextLine}</p>
      )}

      {weather && (weather.tempC != null || weather.condition) && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Thermometer className="h-3 w-3" />
          {weather.tempC != null ? formatTemp(weather.tempC, tempUnit) : "—"}
          {weather.condition && <span>· {weather.condition}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button
          size="sm"
          className="h-8 gap-1 text-[11.5px]"
          disabled={disabled || snapshotLoading}
          onClick={() => refreshSnapshot(true)}
        >
          {snapshotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {snapshotLoading ? "Scanning…" : primaryLabel}
        </Button>
        {onOpenAwareness && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            onClick={onOpenAwareness}
          >
            Open Aware <ArrowRight className="h-3 w-3" />
          </Button>
        )}
        {primaryHelper && (
          <span className="text-[10.5px] text-muted-foreground basis-full">{primaryHelper}</span>
        )}
      </div>
    </Card>
  );
}
