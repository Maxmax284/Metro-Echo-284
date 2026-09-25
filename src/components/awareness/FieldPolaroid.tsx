import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Page = { title: string; extract: string; photo: string | null; url: string | null };

/** A taped field photo of where you are, and a tap-only Echo local read. */
export function FieldPolaroid({
  city, region, country, timeZone, className,
}: { city: string | null; region: string | null; country: string | null; timeZone?: string | null; className?: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [read, setRead] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cacheKey = `vanta.groundread.${city}`;

  const localTime = (() => {
    try { return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? undefined }); }
    catch { return null; }
  })();

  async function call(withRead: boolean) {
    if (!city) return;
    const { data, error } = await supabase.functions.invoke("place-ground-read", {
      body: { city, region, country, localTime, nearby: [], withRead },
    });
    if (error) {
      const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      if (d?.page) setPage(d.page);
      throw new Error(d?.error ?? "Echo couldn't read the place just now.");
    }
    return data as { page: Page | null; read: string | null };
  }

  // Photo only (no AI) on arrival in a new town; cached read restored.
  useEffect(() => {
    setPage(null); setErr(null);
    try { const c = JSON.parse(localStorage.getItem(cacheKey) ?? "null"); setRead(c?.read ?? null); if (c?.page) setPage(c.page); } catch { setRead(null); }
    if (!city) return;
    call(false).then((d) => d?.page && setPage(d.page)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  async function onRead() {
    setBusy(true); setErr(null);
    try {
      const d = await call(true);
      if (d) { setRead(d.read); if (d.page) setPage(d.page); localStorage.setItem(cacheKey, JSON.stringify(d)); }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!city) return null;
  const lines = (read ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <section className={cn("vanta-card overflow-hidden p-4", className)}>
      <div className="flex gap-4 max-[420px]:flex-col">
        <figure className="field-polaroid relative shrink-0 self-start">
          <span aria-hidden className="field-tape" />
          {page?.photo ? (
            <img src={page.photo} alt={`${city}, a photo of the area`} loading="lazy"
              className="h-32 w-44 object-cover max-[420px]:h-44 max-[420px]:w-full" />
          ) : (
            <div className="grid h-32 w-44 place-items-center bg-muted/40 text-[11px] text-muted-foreground max-[420px]:w-full">
              looking for a photo…
            </div>
          )}
          <figcaption className="pt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
            {city}{region ? ` · ${region.replace(/ Province$/, "")}` : ""}
          </figcaption>
        </figure>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ground read</p>
          {lines.length ? (
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-foreground">
              {lines.map((l, i) => (
                <li key={i} className="ground-line" style={{ animationDelay: `${i * 140}ms` }}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
              {page?.extract ? page.extract.split(". ").slice(0, 2).join(". ") + "." : `You're in ${city}. Tap for Echo's read of the area.`}
            </p>
          )}
          {err ? <p className="mt-2 text-[12px] text-warn">{err}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRead} disabled={busy} className="min-h-[40px]">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {read ? "Fresh read" : "Echo's local read"}
            </Button>
            {page?.url ? (
              <a href={page.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                photo & facts: Wikipedia
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
