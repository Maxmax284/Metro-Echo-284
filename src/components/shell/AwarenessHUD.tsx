import { useEffect, useMemo, useState } from "react";
import { useAwareness, AWARENESS_SECTIONS } from "@/providers/AwarenessProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Cloud, Loader2, Maximize2, MapPin, Pin, PinOff, RefreshCcw, Radar, Thermometer, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { toast } from "sonner";
import { SignalCard } from "@/components/awareness/SignalCard";
import { useSignalRoute } from "@/lib/useSignalRoute";

const PIN_STORE_KEY = "vanta:awareness:pinned"; // { [placeId]: string[] }
function loadPinned(placeId: string): string[] {
  try {
    const raw = localStorage.getItem(PIN_STORE_KEY);
    if (!raw) return [];
    const m = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(m[placeId]) ? m[placeId] : [];
  } catch { return []; }
}
function savePinned(placeId: string, keys: string[]) {
  try {
    const raw = localStorage.getItem(PIN_STORE_KEY);
    const m: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    m[placeId] = keys;
    localStorage.setItem(PIN_STORE_KEY, JSON.stringify(m));
  } catch { /* ignore */ }
}

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
  pinned: boolean;
  delay: number;
};

// Stage 6 — Street Signal: classify sources into a trust hierarchy.
// Tier order = display order (top = most authoritative).
type SourceTier = "official" | "local" | "community" | "web" | "ai";
const TIER_META: Record<SourceTier, { label: string; hint: string; tone: string }> = {
  official: { label: "Official",  hint: "Weather, calendars, gov feeds", tone: "bg-primary/15 text-primary ring-primary/40" },
  local:    { label: "Local",     hint: "Maps, nearby places, transit",  tone: "bg-signal/15 text-signal-foreground ring-signal/40" },
  community:{ label: "Community", hint: "Reddit, forums, local chatter (kill-switched)", tone: "bg-accent/15 text-accent ring-accent/40" },
  web:      { label: "Web",       hint: "Search, news, broad lookups",   tone: "bg-warn/15 text-warn-foreground ring-warn/40" },
  ai:       { label: "AI",        hint: "Synthesis layer over above",    tone: "bg-muted/40 text-muted-foreground ring-border/60" },
};
function tierFor(source: string): SourceTier {
  const s = source.toLowerCase();
  if (s.includes("reddit") || s.includes("forum") || s.includes("community")) return "community";
  if (s.includes("weather") || s.includes("meteo") || s.includes("calendar") || s.includes("gov")) return "official";
  if (s.includes("local") || s.includes("places") || s.includes("nearby") || s.includes("maps") || s.includes("transit")) return "local";
  if (s.includes("gemini") || s.includes("lovable-ai") || s.includes("synthesis") || s.includes("brief")) return "ai";
  return "web";
}

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
  const onSignalRoute = useSignalRoute();
  const [open, setOpen] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [serpBusy, setSerpBusy] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);

  // Load pinned keys when place changes
  useEffect(() => {
    if (!place) { setPinned([]); return; }
    setPinned(loadPinned(place.id));
  }, [place?.id]);

  const togglePin = (key: string) => {
    if (!place) return;
    setPinned((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      savePinned(place.id, next);
      return next;
    });
  };

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
  const locationWarning = (compact as any)?.location_warning ?? null;

  // Stage 6 — group sources by trust tier for the Street Signal panel.
  const tieredSources = useMemo(() => {
    const map: Record<SourceTier, string[]> = { official: [], local: [], community: [], web: [], ai: [] };
    for (const s of sources) map[tierFor(s)].push(s);
    return map;
  }, [sources]);
  const tierOrder: SourceTier[] = ["official", "local", "community", "web", "ai"];
  // Street/community tier currently rides the SerpApi switch — when it's off, we surface that.
  const streetDisabled = !!controls && !controls.serpapi_enabled;

  // Build pings: snapshot sources + non-empty briefings + pinned (deduped by key)
  const pings = useMemo<Ping[]>(() => {
    const pinnedSet = new Set(pinned);
    const out: Ping[] = [];
    const seen = new Set<string>();
    let i = 0;
    for (const s of sources) {
      const key = `src:${s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const angle = hashAngle(s);
      const r = radiusFor(generated);
      out.push({
        key, label: s,
        cx: 50 + Math.cos(angle) * r,
        cy: 50 + Math.sin(angle) * r,
        strong: true,
        pinned: pinnedSet.has(key),
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
        key, label: section,
        cx: 50 + Math.cos(angle) * r,
        cy: 50 + Math.sin(angle) * r,
        strong: b.confidence === "high",
        pinned: pinnedSet.has(key),
        delay: (i++ % 5) * 0.35,
      });
    }
    // Ghost pings for pinned keys that no longer have backing data — keep them visible
    for (const key of pinned) {
      if (seen.has(key)) continue;
      seen.add(key);
      const label = key.startsWith("brief:") ? key.slice(6) : key.startsWith("src:") ? key.slice(4) : key;
      const angle = hashAngle(label);
      out.push({
        key, label,
        cx: 50 + Math.cos(angle) * 35,
        cy: 50 + Math.sin(angle) * 35,
        strong: false,
        pinned: true,
        delay: (i++ % 5) * 0.35,
      });
    }
    return out;
  }, [sources, generated, latestBySection, pinned]);

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
            style={{ cursor: "pointer", animationDelay: `${p.delay}s` }}
            role="button"
            tabIndex={0}
            aria-label={`Open ${p.label}`}
            className="radar-fade-in"
          >
            {/* invisible hit target — bigger than the dot */}
            <circle cx={p.cx} cy={p.cy} r={5} fill="transparent" />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.pinned ? 2.2 : p.strong ? 1.6 : 1.2}
              fill={p.pinned ? "hsl(var(--accent, var(--primary)))" : "hsl(var(--primary))"}
              opacity={0.95}
            />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.pinned ? 2.2 : p.strong ? 1.6 : 1.2}
              fill="none"
              stroke={p.pinned ? "hsl(var(--accent, var(--primary)))" : "hsl(var(--primary))"}
              strokeWidth={p.pinned ? 0.6 : 0.4}
              className="radar-ping-pulse"
              style={{ animationDelay: `${p.delay}s` }}
            />
            {p.pinned && (
              <circle
                cx={p.cx}
                cy={p.cy}
                r={4}
                fill="none"
                stroke="hsl(var(--accent, var(--primary)))"
                strokeOpacity={0.55}
                strokeWidth={0.5}
                strokeDasharray="1 1.2"
              />
            )}
            <title>{p.label}{p.pinned ? " · pinned" : ""}</title>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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

        {locationWarning && (
          <div className="mt-3">
            <SignalCard signal={locationWarning} compact generatedAt={generated} />
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Pin className="h-2.5 w-2.5 text-primary/80" />
            {pinned.map((key) => {
              const label = key.startsWith("brief:") ? key.slice(6) : key.startsWith("src:") ? key.slice(4) : key;
              return (
                <button
                  key={key}
                  onClick={() => openPing(key)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-primary ring-1 ring-primary/30 hover:bg-primary/15"
                  title="Open pinned signal"
                >
                  {label}
                  <PinOff
                    className="h-2.5 w-2.5 opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); togglePin(key); }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {(sources.length > 0 || streetDisabled) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {tierOrder.map((t) => {
              const items = tieredSources[t];
              if (!items.length && !(t === "community" && streetDisabled)) return null;
              const meta = TIER_META[t];
              const off = t === "community" && streetDisabled;
              return (
                <span
                  key={t}
                  title={off ? `${meta.label} tier paused (SerpApi off)` : meta.hint}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
                    off ? "bg-muted/30 text-muted-foreground ring-border/60 line-through opacity-70" : meta.tone,
                  )}
                >
                  {meta.label}
                  <span className="opacity-70 normal-case tracking-normal">
                    {items.length || (off ? "off" : 0)}
                  </span>
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

            {locationWarning && (
              <SignalCard
                signal={locationWarning}
                generatedAt={generated}
                onRoute={(route) => toast(`Route: ${route}`)}
              />
            )}

            {/* Focused ping panel */}
            {(() => {
              if (!focusedKey) return null;
              const ping = pings.find((p) => p.key === focusedKey);
              if (!ping) return null;
              const isBrief = focusedKey.startsWith("brief:");
              const section = isBrief ? focusedKey.slice("brief:".length) : null;
              const briefing = section ? latestBySection[section] : null;
              return (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider text-primary">
                      Focused · {isBrief ? "Briefing" : "Source"}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          togglePin(ping.key);
                          toast(pinned.includes(ping.key) ? "Unpinned from radar" : "Pinned to radar");
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 transition-colors",
                          pinned.includes(ping.key)
                            ? "bg-primary/15 text-primary ring-primary/40"
                            : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
                        )}
                      >
                        {pinned.includes(ping.key) ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        {pinned.includes(ping.key) ? "Pinned" : "Pin"}
                      </button>
                      <button
                        onClick={() => setFocusedKey(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-medium capitalize">{ping.label}</div>
                  {briefing ? (
                    <div className="mt-2">
                      <SignalCard
                        signal={briefing.signal ?? { title: ping.label, short_summary: briefing.content, confidence: briefing.confidence ?? "low" }}
                        fallbackBody={briefing.content}
                        generatedAt={briefing.generated_at}
                        onRoute={(route) => toast(`Route: ${route}`)}
                      />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Source feeding the current snapshot. {generated ? `Last sweep ${formatDistanceToNow(new Date(generated), { addSuffix: true })}.` : ""}
                    </p>
                  )}
                </div>
              );
            })()}

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

            {/* Stage 6 — Street Signal hierarchy */}
            <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source hierarchy</div>
                <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                  guarded · cached
                </span>
              </div>
              <ul className="space-y-1.5">
                {tierOrder.map((t) => {
                  const items = tieredSources[t];
                  const meta = TIER_META[t];
                  const off = t === "community" && streetDisabled;
                  if (!items.length && !off) return null;
                  return (
                    <li key={t} className="flex items-start gap-2 text-[12px]">
                      <span
                        className={cn(
                          "mt-[1px] inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
                          off ? "bg-muted/30 text-muted-foreground ring-border/60" : meta.tone,
                        )}
                      >
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        {items.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {items.map((s) => (
                              <span
                                key={s}
                                className="rounded bg-muted/40 px-1.5 py-0.5 text-[10.5px] text-foreground/80 ring-1 ring-border/60"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11.5px] italic text-muted-foreground">
                            {off ? "Paused — SerpApi off" : "—"}
                          </span>
                        )}
                        <div className="mt-0.5 text-[10.5px] text-muted-foreground">{meta.hint}</div>
                      </div>
                    </li>
                  );
                })}
                {sources.length === 0 && !streetDisabled && (
                  <li className="text-[11.5px] italic text-muted-foreground">
                    No sources fed this snapshot yet.
                  </li>
                )}
              </ul>
            </div>

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
