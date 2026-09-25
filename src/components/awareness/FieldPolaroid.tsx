// FieldPolaroid — the field board at the top of Place and context.
//
// Doctrine:
//   - Everything factual here is sourced: photos, the local-language name, the
//     history and the area description come from Wikipedia and say so.
//   - The photo strip and the dossier cost no AI. Echo's read is tap-only.
//   - Motion reports state: the drum turns when the town really changes, the
//     lens breathes to show the watch is live, the read lines type in once.
import { useEffect, useMemo, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { BookOpen, Compass, Landmark, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SignalBeacon } from "@/components/today/SignalBeacon";
import { play } from "@/lib/streetSound";
import { cn } from "@/lib/utils";

type Page = { title: string; extract: string; photo: string | null; url: string | null };
type Area = { localName: string | null; intro: string | null; history: string | null; geography: string | null };
type Payload = { page: Page | null; area: Area | null; photos: string[]; read: string | null };

/** Local-language Wikipedia code, so the second name line is the real one. */
const LANG_BY_COUNTRY: Record<string, string> = {
  thailand: "th", japan: "ja", "south korea": "ko", china: "zh", taiwan: "zh", vietnam: "vi",
  cambodia: "km", laos: "lo", myanmar: "my", indonesia: "id", malaysia: "ms", philippines: "tl",
  france: "fr", spain: "es", mexico: "es", portugal: "pt", brazil: "pt", germany: "de",
  italy: "it", netherlands: "nl", greece: "el", turkey: "tr", russia: "ru", ukraine: "uk",
  israel: "he", "united arab emirates": "ar", egypt: "ar", morocco: "ar", india: "hi",
};

function dayPartFor(tz: string | null | undefined): { part: string; light: string } {
  let hour = new Date().getHours();
  try {
    hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz ?? undefined }));
  } catch { /* device clock */ }
  if (hour < 6) return { part: "night", light: "night" };
  if (hour < 11) return { part: "morning", light: "dawn" };
  if (hour < 16) return { part: "afternoon", light: "day" };
  if (hour < 19) return { part: "evening", light: "golden" };
  return { part: "night", light: "dusk" };
}

type Tab = "about" | "history" | "land";

/** Trim a reference paragraph to something readable on a phone. */
function trim(text: string | null, max = 560): string | null {
  if (!text) return null;
  const clean = text.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(". ") + 1 || max).trim() || `${cut}…`;
}

function wxLabel(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  return "thunderstorms";
}

export function FieldPolaroid({
  city, region, country, timeZone, weather, lat, lon, nearby, className,
}: {
  city: string | null;
  region: string | null;
  country: string | null;
  timeZone?: string | null;
  /** Plain weather line already on file, if any — shapes Echo's read. */
  weather?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** Names of real spots nearby, fed to Echo's read as grounding. */
  nearby?: string[];
  className?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [read, setRead] = useState<string | null>(null);
  const [readPart, setReadPart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [shot, setShot] = useState(0);
  const [liveWx, setLiveWx] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const cacheKey = `vanta.groundread.${city}`;

  // Re-read the clock every 5 minutes so day part follows the real hour.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Live weather at the actual fix — Open-Meteo, free, no AI, refreshed on move and every 30 min.
  useEffect(() => {
    if (lat == null || lon == null) { setLiveWx(null); return; }
    let dead = false;
    const load = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,precipitation`)
        .then((r) => r.json())
        .then((j) => {
          if (dead || !j?.current) return;
          const c = j.current;
          setLiveWx(`${Math.round(c.temperature_2m)}° ${wxLabel(c.weather_code)}${c.precipitation > 0 ? ", wet out" : ""}`);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 30 * 60_000);
    return () => { dead = true; window.clearInterval(t); };
  }, [lat == null ? null : lat.toFixed(2), lon == null ? null : lon.toFixed(2)]);

  const weatherLine = liveWx ?? weather ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { part, light } = useMemo(() => dayPartFor(timeZone), [timeZone, tick]);
  const lang = LANG_BY_COUNTRY[(country ?? "").trim().toLowerCase()] ?? null;
  const localTime = (() => {
    try { return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? undefined }); }
    catch { return null; }
  })();

  async function call(withRead: boolean) {
    if (!city) return;
    const { data: res, error } = await supabase.functions.invoke("place-ground-read", {
      body: { city, region, country, localTime, dayPart: part, weather: weatherLine, lang, nearby: (nearby ?? []).slice(0, 6), withRead },
    });
    if (error) {
      const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      if (d?.page || d?.photos) setData((p) => ({ ...(p ?? { page: null, area: null, photos: [], read: null }), ...d }));
      throw new Error(d?.error ?? "Echo couldn't read the place just now.");
    }
    return res as Payload;
  }

  // Photos + dossier only (no AI) whenever the town changes. Cached read restored.
  useEffect(() => {
    setData(null); setErr(null); setTab("about"); setShot(0);
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
      setRead(c?.read ?? null);
      setReadPart(c?.readPart ?? null);
      if (c?.page || c?.photos) setData(c);
    } catch { setRead(null); setReadPart(null); }
    if (!city) return;
    call(false).then((d) => d && setData(d)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  async function onRead() {
    setBusy(true); setErr(null);
    try {
      const d = await call(true);
      if (d) {
        setRead(d.read); setData(d); setReadPart(part);
        localStorage.setItem(cacheKey, JSON.stringify({ ...d, readPart: part }));
        play("stamp", { gain: 0.5 });
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const readStale = !!read && !!readPart && readPart !== part;


  if (!city) return null;

  const area = data?.area ?? null;
  const photos = data?.photos?.length ? data.photos : data?.page?.photo ? [data.page.photo] : [];
  const lines = (read ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const drumWord = (city.split(/[\s,]+/)[0] ?? city).slice(0, 10);

  const panels: Record<Tab, { label: string; icon: typeof BookOpen; body: string | null; empty: string }> = {
    about: {
      label: "What this place is", icon: Compass,
      body: trim(area?.intro ?? data?.page?.extract ?? null),
      empty: "No reference page for this town yet. The photo strip and Echo's read still work.",
    },
    history: {
      label: "Brief history", icon: Landmark,
      body: trim(area?.history ?? null),
      empty: "Wikipedia has no history section for this place.",
    },
    land: {
      label: "Lay of the land", icon: BookOpen,
      body: trim(area?.geography ?? null),
      empty: "No geography or districts section on file for here.",
    },
  };

  return (
    <section className={cn("vanta-card field-board overflow-hidden p-4", className)} data-light={light}>
      <span aria-hidden className="field-board-wash" />

      {/* Header: the signal, then the town on a drum. */}
      <div className="relative flex flex-wrap items-center gap-3">
        <SignalBeacon state="clear" label={drumWord} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {city}{region ? ` · ${region.replace(/ Province$/, "")}` : ""}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {area?.localName ? <span className="text-foreground/70">{area.localName}</span> : null}
            {area?.localName ? " · " : ""}
            {localTime ? `${localTime} local, ${part}` : part}
            {weather ? ` · ${weather}` : ""}
          </p>
        </div>
      </div>

      {/* The taped photo strip — real pictures of the area, tap to change. */}
      {photos.length ? (
        <div className="relative mt-4 flex gap-3 max-[460px]:flex-col">
          <figure className="field-polaroid relative shrink-0 self-start">
            <span aria-hidden className="field-tape" />
            <img
              key={photos[shot]}
              src={photos[shot]}
              alt={`${city} — a photograph of the area`}
              loading="lazy"
              className="field-shot h-36 w-52 object-cover max-[460px]:h-44 max-[460px]:w-full"
            />
            <figcaption className="pt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
              field snap {shot + 1}/{photos.length}
            </figcaption>
          </figure>
          {photos.length > 1 ? (
            <div className="flex gap-2 self-start max-[460px]:flex-row min-[461px]:flex-col">
              {photos.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setShot(i); play("tick", { gain: 0.4 }); }}
                  aria-label={`Photo ${i + 1} of ${city}`}
                  className={cn(
                    "h-10 w-14 overflow-hidden rounded-[2px] border transition-transform",
                    i === shot ? "border-primary/70 scale-105" : "border-border/60 opacity-70 hover:opacity-100",
                  )}
                >
                  <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid h-24 place-items-center rounded-[2px] border border-dashed border-border/60 text-[11px] text-muted-foreground">
          looking for photographs of {city}…
        </div>
      )}

      {/* The dossier: what this place is, where it came from, how it's laid out. */}
      <div className="relative mt-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(panels) as Tab[]).map((t) => {
            const Icon = panels[t].icon;
            const on = t === tab;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); play("tick", { gain: 0.35 }); }}
                className={cn(
                  "field-tab inline-flex min-h-[38px] items-center gap-1.5 rounded-[3px] border px-2.5 text-[11.5px] font-medium",
                  on ? "border-primary/55 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={on}
              >
                <Icon className="h-3.5 w-3.5" />
                {panels[t].label}
              </button>
            );
          })}
        </div>
        <p key={tab} className="ground-line mt-2.5 text-[13px] leading-relaxed text-foreground/90">
          {panels[tab].body ?? <span className="text-muted-foreground">{panels[tab].empty}</span>}
        </p>
      </div>

      {/* Echo's read — tap only, and it says the hour it was written for. */}
      <div className="relative mt-4 rounded-[3px] border border-border/60 bg-surface-elevated/30 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ground read{lines.length ? ` · written for the ${part}` : ""}
        </p>
        {lines.length ? (
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-foreground">
            {lines.map((l, i) => (
              <li key={`${read?.length}-${i}`} className="ground-line" style={{ animationDelay: `${i * 140}ms` }}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            Echo hasn't read the ground here yet. Tap for the vibe, getting around, money and what to do if it goes sideways.
          </p>
        )}
        {err ? <p className="mt-2 text-[12px] text-warn">{err}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRead} disabled={busy} className="min-h-[40px]">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {read ? "Fresh read for now" : "Echo's local read"}
          </Button>
          {data?.page?.url ? (
            <a href={data.page.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
              photos & facts: Wikipedia
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
