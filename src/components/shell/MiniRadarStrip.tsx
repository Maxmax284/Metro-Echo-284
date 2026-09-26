import { useMemo } from "react";
import { useAwareness, AWARENESS_SECTIONS } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Cloud, Crosshair, Loader2, MapPin, Radar, Sparkles, Thermometer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useSystemControls } from "@/hooks/useSystemControls";
import { SourceStatusPill } from "@/components/awareness/SourceStatusPill";
import { classifyTier, tierScanCopy, normalizeAwarenessSignal, type LocationTier } from "@/lib/awarenessPlainTalk";
import { CONFIDENCE_TONE } from "@/lib/vantaSignal";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";

type Props = {
  className?: string;
  /** Navigate to the full Awareness tab. When omitted, the CTA is hidden. */
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

/**
 * MiniRadarStrip — Command Center pulse. Compact and honest.
 * Shows: tier, place, source state, weather, tier-aware Scan button,
 * top 1–3 plain-talk signals. NO full radar canvas. Tapping "Open Awareness"
 * sends the user to the radar room.
 */
export function MiniRadarStrip({ className, onOpenAwareness }: Props) {
  const { place, snapshot, snapshotLoading, refreshSnapshot, overall, latestBySection } = useAwareness();
  const { controls } = useSystemControls();
  const [tempUnit] = useTempUnit();

  const compactData = snapshot?.compact;
  const weather = compactData?.weather;
  const generated = snapshot?.generated_at;
  const tier = useMemo(() => classifyTier(place), [place]);
  const scan = useMemo(() => tierScanCopy(tier, { serpEnabled: controls?.serpapi_enabled }), [tier, controls?.serpapi_enabled]);
  const confTone = overall.confidence
    ? CONFIDENCE_TONE[overall.confidence]
    : "bg-muted/40 text-muted-foreground ring-border/60";

  // Top 1–3 plain-talk signals — freshest, non-empty, normalized to short summary
  const topSignals = useMemo(() => {
    const items: { section: string; summary: string }[] = [];
    const ordered = [...AWARENESS_SECTIONS]
      .map((s) => ({ s, b: latestBySection[s] }))
      .filter((x) => !!x.b)
      .sort((a, b) => new Date(b.b!.generated_at).getTime() - new Date(a.b!.generated_at).getTime());
    for (const { s, b } of ordered) {
      const sig = normalizeAwarenessSignal(s, b, { place, compact: true });
      if (sig.short_summary && sig.short_summary.trim()) {
        items.push({ section: s, summary: sig.short_summary });
      }
      if (items.length >= 3) break;
    }
    return items;
  }, [latestBySection, place]);

  if (!place) {
    return (
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Radar className="h-3.5 w-3.5" />
            No active place yet — capture one to wake the radar.
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

  return (
    <Card className={cn("border-border/60 bg-surface-elevated/40 p-3 space-y-2", className)}>
      {/* Row 1 — identity */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1 text-foreground/90">
          <MapPin className="h-3.5 w-3.5 text-primary/80" />
          <span className="font-medium">{place.label}</span>
        </span>
        <span
          title={`Location tier: ${tier.tier} — ${tier.display}`}
          className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1", TIER_TONE[tier.tier])}
        >
          {tier.tier}
        </span>
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1", confTone)}>
          {overall.confidence ?? "no signal"}
        </span>
        <SourceStatusPill />
        {generated ? (
          <span
            className="ml-auto text-[10.5px] text-muted-foreground"
            title={new Date(generated).toLocaleString()}
          >
            scanned {formatDistanceToNow(new Date(generated), { addSuffix: true })}
          </span>
        ) : (
          <span className="ml-auto text-[10.5px] text-muted-foreground">never scanned</span>
        )}
      </div>

      {/* Row 2 — weather inline (when present) */}
      {weather && (
        <div className="flex items-center gap-2 text-[12px] text-foreground/80">
          <Thermometer className="h-3 w-3 text-muted-foreground" />
          {weather.tempC != null ? formatTemp(weather.tempC, tempUnit) : "—"}
          {weather.condition && <span className="text-muted-foreground">· {weather.condition}</span>}
        </div>
      )}
      {!weather && !generated && (
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Cloud className="h-3 w-3" /> No scan yet. Tap below when you want one.
        </div>
      )}

      {/* Row 3 — top plain-talk signals */}
      {topSignals.length > 0 && (
        <ul className="space-y-0.5 text-[12px]">
          {topSignals.map((sig) => (
            <li key={sig.section} className="flex gap-1.5">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground shrink-0 w-16 capitalize">
                {sig.section}
              </span>
              <span className="text-foreground/85 leading-snug">{sig.summary}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Row 4 — tier-aware Scan + Open Awareness */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
        {onOpenAwareness && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            onClick={onOpenAwareness}
          >
            Open Awareness <ArrowRight className="h-3 w-3" />
          </Button>
        )}
        <span className="text-[10.5px] text-muted-foreground basis-full">{scan.sourceImpact}</span>
      </div>
    </Card>
  );
}
