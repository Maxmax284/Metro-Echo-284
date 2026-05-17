import { useMemo, useState } from "react";
import { useAwareness, AWARENESS_SECTIONS } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Cloud, Loader2, Maximize2, MapPin, RefreshCcw, Radar, Thermometer, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { toast } from "sonner";

/**
 * AwarenessHUD — Stage 3.
 * Radar canvas (SVG sweep), source pings, top signals, and an
 * expanded drawer. Read-only on the canvas; refresh + owner SerpApi
 * toggle preserved from MiniRadarStrip.
 */

type Ping = {
  key: string;
  label: string;
  cx: number;
  cy: number;
  strong: boolean;
  delay: number;
};

const FRESH_MS = 24 * 60 * 60 * 1000;
const AGING_MS = 7 * 24 * 60 * 60 * 1000;

function hashAngle(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 360) * (Math.PI / 180);
}

function radiusFor(generatedAt: string | null | undefined) {
  if (!generatedAt) return 40;
  const age = Date.now() - new Date(generatedAt).getTime();
  if (age < FRESH_MS) return 20;
  if (age < AGING_MS) return 30;
  return 40;
}

export function AwarenessHUD({ className }: { className?: string }) {
  const {
    place,
    snapshot,
    snapshotLoading,
    refreshSnapshot,
    latestBySection,
    overall,
  } = useAwareness();
  const isOwner = useIsOwner();
  const { controls, update } = useSystemControls();
  const [open, setOpen] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [serpBusy, setSerpBusy] = useState(false);

  const openPing = (key: string) => {
    setFocusedKey(key);
    setOpen(true);
  };

  const toggleSerp = async () => {
    if (!controls || serpBusy) return;
    const next = !controls.serpapi_enabled;
    setSerpBusy(true);
    try {
      await update({ serpapi_enabled: next });
      toast(next ? "SerpApi resumed" : "SerpApi paused");
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
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 transition-colors disabled:opacity-60",
          on
            ? "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/20"
            : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary" : "bg-amber-400")} />
        SerpApi: {on ? "on" : "off"}
      </button>
    );
  };

  const compact = snapshot?.compact;
  const weather = compact?.weather;
  const summary = compact?.summary;
  const sources = snapshot?.sources_used ?? [];
  const generated = snapshot?.generated_at;

  // Build pings: snapshot sources + non-empty briefings (deduped by label)
  const pings = useMemo<Ping[]>(() => {
    const out: Ping[] = [];
    const seen = new Set<string>();
    let i = 0;
    for (const s of sources) {
      if (seen.has(s)) continue;
      seen.add(s);
      const angle = hashAngle(s);
      const r = radiusFor(generated);
      out.push({
        key: `src:${s}`,
        label: s,
        cx: 50 + Math.cos(angle) * r,
        cy: 50 + Math.sin(angle) * r,
        strong: true,
        delay: (i++ % 5) * 0.35,
      });
    }
    for (const section of AWARENESS_SECTIONS) {
      const b = latestBySection[section];
      if (!b) continue;
      const key = `brief:${section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const angle = hashAngle(section);
      const r = radiusFor(b.generated_at);
      out.push({
        key,
        label: section,
        cx: 50 + Math.cos(angle) * r,
        cy: 50 + Math.sin(angle) * r,
        strong: b.confidence === "high",
        delay: (i++ % 5) * 0.35,
      });
    }
    return out;
  }, [sources, generated, latestBySection]);

  // Top signals (max 3): weather, summary, freshest briefing
  const topSignals = useMemo(() => {
    const items: { key: string; icon: typeof Cloud; label: string; value: string }[] = [];
    if (weather) {
      items.push({
        key: "weather",
        icon: Thermometer,
        label: "Weather",
        value: `${weather.tempC != null ? Math.round(weather.tempC) + "°C" : "—"}${weather.condition ? " · " + weather.condition : ""}`,
      });
    }
    if (summary) {
      items.push({ key: "summary", icon: Sparkles, label: "Brief", value: summary.split("\n")[0].slice(0, 110) });
    }
    const freshest = overall.briefings[0];
    if (freshest) {
      items.push({
        key: "brief",
        icon: Radar,
        label: freshest.section,
        value: freshest.content.split("\n")[0].slice(0, 110),
      });
    }
    return items.slice(0, 3);
  }, [weather, summary, overall.briefings]);

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

  const RadarCanvas = ({ size = 144 }: { size?: number }) => (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="block">
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.18)" />
            <stop offset="100%" stopColor="hsl(var(--surface-elevated) / 0.0)" />
          </radialGradient>
          <linearGradient id="radar-sweep-grad" x1="50%" y1="50%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.35)" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
          </linearGradient>
        </defs>

        {/* backdrop + rings */}
        <circle cx="50" cy="50" r="48" fill="url(#radar-bg)" />
        {[16, 30, 44].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.55} strokeWidth={0.4} />
        ))}
        <line x1="50" y1="2" x2="50" y2="98" stroke="hsl(var(--border))" strokeOpacity={0.35} strokeWidth={0.3} />
        <line x1="2" y1="50" x2="98" y2="50" stroke="hsl(var(--border))" strokeOpacity={0.35} strokeWidth={0.3} />

        {/* sweep wedge */}
        <g className="radar-sweep">
          <path d="M50,50 L50,2 A48,48 0 0 1 95,28 Z" fill="url(#radar-sweep-grad)" />
        </g>

        {/* pings */}
        {pings.map((p) => (
          <g
            key={p.key}
            onClick={() => openPing(p.key)}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            aria-label={`Open ${p.label}`}
          >
            {/* invisible hit target — bigger than the dot */}
            <circle cx={p.cx} cy={p.cy} r={5} fill="transparent" />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.strong ? 1.6 : 1.2}
              fill="hsl(var(--primary))"
              opacity={0.95}
            />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.strong ? 1.6 : 1.2}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={0.4}
              className="radar-ping-pulse"
              style={{ animationDelay: `${p.delay}s` }}
            />
            <title>{p.label}</title>
          </g>
        ))}

        {/* center */}
        <circle cx="50" cy="50" r="1.4" fill="hsl(var(--primary))" />
      </svg>
    </div>
  );

  return (
    <>
      <Card className={cn("border-border/60 bg-surface-elevated/40 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3 w-3 text-primary" /> Radar
          </div>
          <div className="flex items-center gap-1">
            <SerpPill />
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

        <div className="mt-3 flex items-start gap-3">
          <RadarCanvas size={120} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
              <span className="inline-flex items-center gap-1 text-foreground/90">
                <MapPin className="h-3 w-3 text-primary/80" />
                {place.label}
              </span>
              {generated && (
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(generated), { addSuffix: true })}
                </span>
              )}
            </div>

            {topSignals.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {topSignals.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.key} className="flex items-start gap-1.5 text-[12px] leading-snug">
                      <Icon className="mt-[2px] h-3 w-3 shrink-0 text-primary/80" />
                      <span className="min-w-0 flex-1 text-foreground/85">
                        <span className="text-muted-foreground capitalize">{s.label}: </span>
                        {s.value}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : !snapshot ? (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                No snapshot yet. Hit Generate to assemble one.
              </p>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                <Cloud className="h-3 w-3" /> Snapshot warming up…
              </p>
            )}
          </div>
        </div>

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
            <DrawerTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary" /> Radar · {place.label}
              </span>
              <SerpPill />
            </DrawerTitle>
          </DrawerHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[13px]">
            <div className="flex justify-center">
              <RadarCanvas size={220} />
            </div>

            {topSignals.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Top signals</div>
                <ul className="space-y-1.5">
                  {topSignals.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li key={s.key} className="flex items-start gap-2">
                        <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary/80" />
                        <span className="min-w-0 flex-1">
                          <span className="text-muted-foreground capitalize">{s.label}: </span>
                          <span className="text-foreground/90">{s.value}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {weather && (
              <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Weather</div>
                <div className="mt-1">
                  {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : "—"}
                  {weather.condition ? ` · ${weather.condition}` : ""}
                </div>
              </div>
            )}

            {summary && (
              <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Brief</div>
                <p className="mt-1 leading-relaxed text-foreground/90">{summary}</p>
              </div>
            )}

            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sources.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {snapshot?.full_data && (
              <details className="rounded-lg border border-border/60 bg-surface-elevated/30 p-3">
                <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground">
                  Full snapshot
                </summary>
                <pre className="mt-2 max-h-[40dvh] overflow-auto whitespace-pre-wrap text-[11px] text-foreground/70">
{JSON.stringify(snapshot.full_data, null, 2)}
                </pre>
              </details>
            )}

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => refreshSnapshot(true)}
              disabled={snapshotLoading}
            >
              {snapshotLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
              Refresh snapshot
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
