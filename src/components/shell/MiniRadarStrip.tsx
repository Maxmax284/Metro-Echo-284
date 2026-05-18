import { useMemo, useState } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Cloud, Loader2, Maximize2, MapPin, RefreshCcw, Radar, Thermometer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { toast } from "sonner";
import { AttentionQueue } from "@/components/awareness/AttentionQueue";
import { SourceStatusPill } from "@/components/awareness/SourceStatusPill";

type SourceTier = "official" | "local" | "community" | "web" | "ai";
const TIER_META: Record<SourceTier, { label: string; tone: string }> = {
  official: { label: "Official",  tone: "bg-primary/15 text-primary ring-primary/40" },
  local:    { label: "Local",     tone: "bg-signal/15 text-signal-foreground ring-signal/40" },
  community:{ label: "Community", tone: "bg-accent/15 text-accent ring-accent/40" },
  web:      { label: "Web",       tone: "bg-warn/15 text-warn-foreground ring-warn/40" },
  ai:       { label: "AI",        tone: "bg-muted/40 text-muted-foreground ring-border/60" },
};
function tierFor(source: string): SourceTier {
  const s = source.toLowerCase();
  if (s.includes("reddit") || s.includes("forum") || s.includes("community")) return "community";
  if (s.includes("weather") || s.includes("meteo") || s.includes("calendar") || s.includes("gov")) return "official";
  if (s.includes("local") || s.includes("places") || s.includes("nearby") || s.includes("maps") || s.includes("transit")) return "local";
  if (s.includes("gemini") || s.includes("lovable-ai") || s.includes("synthesis") || s.includes("brief")) return "ai";
  return "web";
}

const CONF_DOT: Record<string, string> = {
  high:   "bg-primary",
  medium: "bg-accent",
  low:    "bg-warn",
};

/**
 * MiniRadarStrip — compact awareness pulse for the Command Center.
 * Read-only. Tier chips replace the raw source label cloud.
 */
export function MiniRadarStrip({ className }: { className?: string }) {
  const { place, snapshot, snapshotLoading, refreshSnapshot, overall } = useAwareness();
  const isMobile = useIsMobile();
  const isOwner = useIsOwner();
  const { controls, update } = useSystemControls();
  const [open, setOpen] = useState(false);
  const [serpBusy, setSerpBusy] = useState(false);

  const toggleSerp = async () => {
    if (!controls || serpBusy) return;
    const next = !controls.serpapi_enabled;
    setSerpBusy(true);
    try {
      await update({ serpapi_enabled: next });
      if (next) toast.success("SerpApi resumed");
      else toast("SerpApi paused", { description: "Search, news, and local lookups will be blocked." });
    } catch {
      toast.error("Couldn't update SerpApi");
    } finally {
      setSerpBusy(false);
    }
  };

  const SerpPill = () => {
    if (!isOwner || !controls) return null;
    const on = controls.serpapi_enabled;
    return (
      <button
        type="button"
        onClick={toggleSerp}
        disabled={serpBusy}
        title={on ? "External search is on." : "External search is off — I'm using saved/cached info only."}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wider ring-1 transition-colors disabled:opacity-60",
          on
            ? "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/20"
            : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary" : "bg-amber-400")} />
        Search: {on ? "on" : "off"}
      </button>
    );
  };

  const compact = snapshot?.compact;
  const weather = compact?.weather;
  const summary = compact?.summary;
  const sources = snapshot?.sources_used ?? [];
  const generated = snapshot?.generated_at;
  const streetDisabled = !!controls && !controls.serpapi_enabled;

  const tieredSources = useMemo(() => {
    const map: Record<SourceTier, string[]> = { official: [], local: [], community: [], web: [], ai: [] };
    for (const s of sources) map[tierFor(s)].push(s);
    return map;
  }, [sources]);
  const tierOrder: SourceTier[] = ["official", "local", "community", "web", "ai"];

  if (!place) {
    return (
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Radar className="h-3.5 w-3.5" />
          No active place. Capture one in Awareness to enable the radar.
        </div>
      </Card>
    );
  }

  const confDot = overall.confidence ? CONF_DOT[overall.confidence] : "bg-muted-foreground/40";

  return (
    <>
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3 w-3 text-primary" /> Radar
          </div>
          <div className="flex items-center gap-1">
            {!isMobile && <SourceStatusPill />}
            {!isMobile && <SerpPill />}
            {isMobile && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setOpen(true)}
                title="Expand radar"
                aria-label="Expand radar"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[11px]"
              onClick={() => refreshSnapshot(true)}
              disabled={snapshotLoading}
              title={snapshot ? "Refresh signal (guarded, cached when possible)" : "Scan this area now (guarded)"}
            >
              {snapshotLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              {snapshot ? "Refresh" : "Scan area"}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 text-foreground/90">
            <span className={cn("h-1.5 w-1.5 rounded-full", confDot)} title={overall.confidence ?? "no signal"} aria-hidden />
            <MapPin className="h-3 w-3 text-primary/80" />
            {place.label}
          </span>
          {weather ? (
            <span className="inline-flex items-center gap-1 text-foreground/80">
              <Thermometer className="h-3 w-3" />
              {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : "—"}
              {weather.condition ? <span className="text-muted-foreground">· {weather.condition}</span> : null}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Cloud className="h-3 w-3" /> weather pending
            </span>
          )}
          {generated ? (
            <span
              className="text-[10.5px] text-muted-foreground"
              title={new Date(generated).toLocaleString()}
            >
              scanned {formatDistanceToNow(new Date(generated), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-[10.5px] text-muted-foreground">never scanned</span>
          )}
        </div>

        {summary ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85">{summary}</p>
        ) : snapshot ? null : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            No scan yet. Tap <span className="font-medium text-foreground/80">Scan area</span> when you want one.
          </p>
        )}

        {streetDisabled && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            External search is off — I'm using saved/cached info only.
          </p>
        )}

        {(sources.length > 0 || streetDisabled) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {tierOrder.map((t) => {
              const items = tieredSources[t];
              const off = t === "community" && streetDisabled;
              if (!items.length && !off) return null;
              const meta = TIER_META[t];
              return (
                <span
                  key={t}
                  title={
                    off
                      ? "Community signal is off, so I'm not checking Reddit/forums/local chatter."
                      : `${items.length} ${meta.label.toLowerCase()} source(s) feeding this scan`
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
                    off ? "bg-muted/30 text-muted-foreground ring-border/60 line-through opacity-70" : meta.tone,
                  )}
                >
                  {meta.label}
                  <span className="opacity-70 normal-case tracking-normal">{items.length || (off ? "off" : 0)}</span>
                </span>
              );
            })}
          </div>
        )}
      </Card>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[90dvh] p-0">
          <DrawerHeader className="border-b border-border/60">
            <DrawerTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /> Radar · {place.label}</span>
              <div className="flex items-center gap-1"><SourceStatusPill /><SerpPill /></div>
            </DrawerTitle>
          </DrawerHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[13px]">
            {summary && <p className="leading-relaxed text-foreground/90">{summary}</p>}
            {weather && (
              <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Weather</div>
                <div className="mt-1">
                  {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : "—"}
                  {weather.condition ? ` · ${weather.condition}` : ""}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border/60 bg-surface-elevated/30 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Attention</div>
              <AttentionQueue onOpenSection={() => setOpen(false)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => refreshSnapshot(true)}
              disabled={snapshotLoading}
            >
              {snapshotLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
              Refresh snapshot
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
