import { useState } from "react";
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

/**
 * MiniRadarStrip — compact awareness pulse for the Command Center.
 * Read-only. Uses the snapshot already fetched by AwarenessProvider.
 * Refresh button calls refreshSnapshot() which goes through the guarded
 * awareness-snapshot edge function (no client-side external calls).
 * On mobile, tapping Expand opens a full-screen drawer with all snapshot detail.
 */
export function MiniRadarStrip({ className }: { className?: string }) {
  const { place, snapshot, snapshotLoading, refreshSnapshot } = useAwareness();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const { place, snapshot, snapshotLoading, refreshSnapshot } = useAwareness();
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

  const SerpPill = ({ compact: pillCompact = false }: { compact?: boolean }) => {
    if (!isOwner || !controls) return null;
    const on = controls.serpapi_enabled;
    return (
      <button
        type="button"
        onClick={toggleSerp}
        disabled={serpBusy}
        title={on ? "SerpApi is on — click to pause" : "SerpApi is paused — click to resume"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wider ring-1 transition-colors disabled:opacity-60",
          on
            ? "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/20"
            : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
          pillCompact && "px-1.5"
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary" : "bg-amber-400")} />
        SerpApi: {on ? "on" : "off"}
      </button>
    );
  };

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

  const compact = snapshot?.compact;
  const weather = compact?.weather;
  const summary = compact?.summary;
  const sources = snapshot?.sources_used ?? [];
  const generated = snapshot?.generated_at;

  return (
    <>
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3 w-3 text-primary" /> Radar
          </div>
          <div className="flex items-center gap-1">
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
              title="Refresh snapshot (guarded)"
            >
              {snapshotLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              {snapshot ? "Refresh" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className="inline-flex items-center gap-1 text-foreground/90">
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
          {generated && (
            <span className="text-[10.5px] text-muted-foreground">
              {formatDistanceToNow(new Date(generated), { addSuffix: true })}
            </span>
          )}
        </div>

        {summary ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85">{summary}</p>
        ) : snapshot ? null : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            No snapshot yet. Hit Generate to assemble one (cached weather, optional local signals, brief synthesis — all behind the leash).
          </p>
        )}

        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sources.map((s) => (
              <span
                key={s}
                className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[90dvh] p-0">
          <DrawerHeader className="border-b border-border/60">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <Radar className="h-4 w-4 text-primary" /> Radar · {place.label}
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
            {snapshot?.full_data && (
              <details className="rounded-lg border border-border/60 bg-surface-elevated/30 p-3">
                <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground">Full snapshot</summary>
                <pre className="mt-2 max-h-[40dvh] overflow-auto whitespace-pre-wrap text-[11px] text-foreground/70">
{JSON.stringify(snapshot.full_data, null, 2)}
                </pre>
              </details>
            )}
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sources.map((s) => (
                  <span key={s} className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
                    {s}
                  </span>
                ))}
              </div>
            )}
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
