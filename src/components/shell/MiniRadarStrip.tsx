import { useAwareness } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cloud, Loader2, MapPin, RefreshCcw, Radar, Thermometer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * MiniRadarStrip — compact awareness pulse for the Command Center.
 * Read-only. Uses the snapshot already fetched by AwarenessProvider.
 * Refresh button calls refreshSnapshot() which goes through the guarded
 * awareness-snapshot edge function (no client-side external calls).
 */
export function MiniRadarStrip({ className }: { className?: string }) {
  const { place, snapshot, snapshotLoading, refreshSnapshot } = useAwareness();

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
    <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Radar className="h-3 w-3 text-primary" /> Radar
        </div>
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
  );
}
