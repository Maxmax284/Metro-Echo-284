// HelpDesk — help where you are standing, and where care actually is.
//
// Doctrine:
//   - The published emergency number sits above everything, because in the worst
//     minute a number beats a directory. Echo says it; it never dials.
//   - Every place on the list came from a map record. A blank field stays blank.
//   - Distances are straight-line and say so. They are not drive times.
//   - Keeping a place is the person's own record, and it shows up on the board.
import { useMemo, useState } from "react";
import { LifeBuoy, MapPin, Phone, Pin, PinOff, RefreshCw, Search, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useCareNearby } from "@/hooks/useCareNearby";
import { vantaToast } from "@/lib/vantaVoice";
import { helpAnswer } from "@/lib/localHelp";
import {
  CARE_KINDS,
  CARE_LAW,
  careKindLabel,
  careSourceWords,
  careMapLink,
  distanceWords,
  filterCare,
  type CareKind,
} from "@/lib/careFinder";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function HelpDesk() {
  const [kinds, setKinds] = useState<CareKind[]>([]);
  const [query, setQuery] = useState("");
  const { places, radiusM, source, loading, error, hasFix, country, placeLabel, kept, look, keep, forget } = useCareNearby(kinds);

  const rows = useMemo(() => filterCare(places, query, kinds), [places, query, kinds]);
  const help = useMemo(() => helpAnswer(country), [country]);
  const keptNames = useMemo(() => new Set(kept.map((k) => k.label.toLowerCase())), [kept]);

  const toggleKind = (k: CareKind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <div className="space-y-3">
      <Card className="vanta-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-[13px] font-medium">If it is urgent</p>
        </div>
        <p className="whitespace-pre-line text-[12.5px] text-foreground/90">{help}</p>
      </Card>

      <Card className="vanta-card space-y-3 p-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Around you</p>
            {placeLabel && <p className="truncate text-[10.5px] text-muted-foreground">From {placeLabel}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 px-2 text-[12px]"
            onClick={() => void look(true)}
            disabled={!hasFix || loading}
          >
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Look again
          </Button>
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {CARE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => toggleKind(k.id)}
              aria-pressed={kinds.includes(k.id)}
              title={k.plain}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-[12px]",
                MOTION_FOCUS,
                kinds.includes(k.id)
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or street"
            aria-label="Search places nearby"
            className="h-10 pl-7 text-[13px]"
          />
        </div>

        {!hasFix ? (
          <p className="text-[12.5px] text-muted-foreground">
            Echo does not have a place for you yet, so it will not list care from the last city you were in. Set where
            you are and the list fills in.
          </p>
        ) : loading ? (
          <LoadingState label="Reading the map…" />
        ) : error ? (
          <ErrorState detail={error} onRetry={() => void look()} />
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            {places.length === 0
              ? `Neither place provider has anything recorded within ${Math.max(1, Math.round(radiusM / 1000))} km of where Echo has you. That is the records being empty, not care being absent — check the place Echo is holding for you.`
             Nothing on the list matches that. Clear the search to see all of it."}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 40).map((p) => {
              const isKept = keptNames.has(p.name.toLowerCase());
              return (
                <li key={p.id} className="border-l-2 border-border/70 pl-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-foreground/90">{p.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="text-primary/80">{careKindLabel(p.kind)}</span>
                        <span>{distanceWords(p.distanceM)}, straight line</span>
                        {p.address && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{p.address}</span>
                          </span>
                        )}
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-primary/80 underline">
                            <Phone className="h-3 w-3" aria-hidden />
                            {p.phone}
                          </a>
                        )}
                        {p.hours && <span>hours as recorded: {p.hours}</span>}
                        <a
                          href={careMapLink(p)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary/80 underline"
                        >
                          Open on the map
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={isKept ? `${p.name} is already kept` : `Keep ${p.name} on the board`}
                      disabled={isKept}
                      onClick={async () => {
                        await keep(p);
                        vantaToast.success("Kept. It shows on the board with your days.");
                      }}
                      className={cn("shrink-0 rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS, isKept && "opacity-40")}
                    >
                      <Pin className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground/80">
          {CARE_LAW} Food, cash, transport and everyday essentials are included. Listings come from {careSourceWords(source)}.
        </p>
      </Card>

      {kept.length > 0 && (
        <Card className="vanta-card space-y-2 p-3">
          <p className="vanta-machine-label text-foreground/70">Kept for the board</p>
          <ul className="space-y-1.5">
            {kept.map((k) => (
              <li key={k.id} className="flex items-start gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="text-foreground/90">{k.label}</span>
                  {k.address && <span className="text-muted-foreground"> · {k.address}</span>}
                  {k.notes && <span className="block text-[11px] text-muted-foreground">{k.notes}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Stop keeping ${k.label}`}
                  onClick={() => void forget(k.id)}
                  className={cn("shrink-0 rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS)}
                >
                  <PinOff className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AftermathHint text="A kept place shows on the Board beside your days. Echo says the number; calling stays yours." />
    </div>
  );
}
