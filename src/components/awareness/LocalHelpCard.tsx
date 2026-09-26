// LocalHelpCard — help and care for the ground this board is reading.
//
// Doctrine:
//   - The published emergency number sits above everything, from the fixed
//     country table only, always named with its country — never claimed as
//     "local", never guessed, and Echo never dials.
//   - The care list reads the live fix only. Reading a saved place never
//     borrows the care of wherever you happen to be standing.
//   - Kept care is the person's own record; it shows on every board.
//   - One lookup per fix, no watcher. Distances are straight-line and say so.
import { useMemo, useState } from "react";
import { ChevronDown, LifeBuoy, MapPin, Phone, Pin, PinOff, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { useCareNearby } from "@/hooks/useCareNearby";
import { helpFor } from "@/lib/localHelp";
import {
  CARE_LAW,
  careKindLabel,
  careMapLink,
  careSourceWords,
  distanceWords,
  filterCare,
  type CareKind,
  type CarePlace,
} from "@/lib/careFinder";
import { vantaToast } from "@/lib/vantaVoice";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* The four kinds this card leads with, in the order urgency runs. */
const MED_KINDS: CareKind[] = ["emergency", "hospital", "clinic", "pharmacy"];
const KIND_CHIPS: Array<{ id: CareKind; label: string }> = [
  { id: "emergency", label: "Emergency room" },
  { id: "hospital", label: "Hospital" },
  { id: "clinic", label: "Clinic" },
  { id: "pharmacy", label: "Pharmacy" },
];

/** The number, from the fixed table only. A missing table row says so. */
function EmergencyStrip({ country }: { country: string | null }) {
  const row = helpFor(country);
  if (!row) {
    const named = (country ?? "").trim();
    return (
      <p className="text-[12px] leading-snug text-muted-foreground">
        {named
          ? `Echo has no recorded emergency number for ${named}, and a wrong number is worse than none. Ask a local, or check the number posted where you are staying.`
          : "Echo does not know which country this place is in yet, so there is no number it can honestly give. Once the place is named, the number lands here."}
      </p>
    );
  }
  const parts = [
    row.police ? `police ${row.police}` : "",
    row.ambulance ? `ambulance ${row.ambulance}` : "",
    row.fire ? `fire ${row.fire}` : "",
  ].filter(Boolean);
  return (
    <div className="space-y-0.5 rounded-lg border border-warn/30 bg-warn/[0.05] px-2.5 py-2">
      <p className="text-[12.5px] leading-snug text-foreground/90">
        {row.general ? (
          <>
            In {row.country}, call <span className="font-semibold text-foreground">{row.general}</span> for anything
            urgent.
          </>
        ) : (
          <>
            In {row.country}: {parts.join(" · ")}.
          </>
        )}
      </p>
      {row.general && parts.length > 0 ? (
        <p className="text-[11.5px] leading-snug text-foreground/80">Direct: {parts.join(" · ")}.</p>
      ) : null}
      {row.note ? <p className="text-[11px] leading-snug text-muted-foreground">{row.note}</p> : null}
      <p className="text-[10.5px] leading-snug text-muted-foreground/80">
        Echo can't make the call. Say where you are first, then what happened.
      </p>
    </div>
  );
}

function CareRow({ p, isKept, onKeep }: { p: CarePlace; isKept: boolean; onKeep: () => void }) {
  return (
    <li className="border-l-2 border-border/70 pl-2">
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
            <a href={careMapLink(p)} target="_blank" rel="noreferrer" className="text-primary/80 underline">
              Open on the map
            </a>
          </div>
        </div>
        <button
          type="button"
          aria-label={isKept ? `${p.name} is already kept` : `Keep ${p.name} on the board`}
          disabled={isKept}
          onClick={onKeep}
          className={cn("shrink-0 rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS, isKept && "opacity-40")}
        >
          <Pin className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function LocalHelpCard({
  country,
  boardLabel,
  boardIsLive,
  className,
}: {
  /** The country of the place this board reads — the numbers follow it. */
  country: string | null;
  /** What the board calls that place, for honest "you are reading X" copy. */
  boardLabel: string | null;
  /** Care nearby only ever reads where you are standing. */
  boardIsLive: boolean;
  className?: string;
}) {
  const [focus, setFocus] = useState<CareKind | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const kinds = useMemo(() => (focus ? [focus] : MED_KINDS), [focus]);
  const { places, radiusM, source, loading, error, hasFix, placeLabel, kept, look, keep, forget } =
    useCareNearby(kinds, { lookup: boardIsLive });
  const rows = useMemo(() => filterCare(places, query), [places, query]);
  const keptNames = useMemo(() => new Set(kept.map((k) => k.label.toLowerCase())), [kept]);

  return (
    <section className={cn("vanta-card space-y-2.5 rounded-xl p-3", className)}>
      <div className="flex items-center gap-1.5">
        <LifeBuoy className="h-3.5 w-3.5 text-warn" aria-hidden />
        <span className="vanta-machine-label text-foreground/70">Help and care · this ground</span>
        {boardIsLive && hasFix ? (
          <button
            type="button"
            onClick={() => void look(true)}
            disabled={loading}
            className={cn(
              "ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground hover:text-foreground",
              MOTION_FOCUS,
            )}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden />
            Look again
          </button>
        ) : null}
      </div>

      <EmergencyStrip country={country} />

      {boardIsLive ? (
        !hasFix ? (
          <p className="text-[12px] leading-snug text-muted-foreground">
            Echo does not have a place for you yet, so it will not list care from the last city you were in. Set
            where you are and the list fills in.
          </p>
        ) : loading ? (
          <LoadingState label="Reading the map…" />
        ) : error ? (
          <ErrorState detail={error} onRetry={() => void look()} />
        ) : rows.length === 0 ? (
          <p className="text-[12px] leading-snug text-muted-foreground">
            {places.length === 0
              ? `Neither place provider has anything recorded within ${Math.max(1, Math.round(radiusM / 1000))} km of where Echo has you. That is the records being empty, not proof care is absent — ask where you are staying.`
              : "Nothing on the list matches that. Clear the search to see all of it."}
          </p>
        ) : (
          <>
            {open ? (
              <div className="space-y-2">
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {KIND_CHIPS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setFocus((cur) => (cur === k.id ? null : k.id))}
                      aria-pressed={focus === k.id}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-[12px]",
                        MOTION_FOCUS,
                        focus === k.id
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or street"
                    aria-label="Search care nearby"
                    className="h-10 pl-7 text-[13px]"
                  />
                </div>
              </div>
            ) : null}
            {placeLabel && !open ? (
              <p className="text-[10.5px] text-muted-foreground">Nearest first, from {placeLabel}.</p>
            ) : null}
            <ul className="space-y-2">
              {(open ? rows.slice(0, 20) : rows.slice(0, 3)).map((p) => (
                <CareRow
                  key={p.id}
                  p={p}
                  isKept={keptNames.has(p.name.toLowerCase())}
                  onKeep={async () => {
                    await keep(p);
                    vantaToast.success("Kept. It shows on the board with your days.");
                  }}
                />
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground",
                MOTION_FOCUS,
              )}
            >
              {open ? "Back to the nearest three" : "All care nearby · filter and search"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          </>
        )
      ) : (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Care nearby reads where you are standing, and this board is reading {boardLabel ?? "a saved place"}.
          Switch back to your live place for the list around you.
        </p>
      )}

      {kept.length > 0 ? (
        <div className="space-y-1.5 border-t border-border/40 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Kept for the board</p>
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
        </div>
      ) : null}

      <p className="text-[10.5px] leading-snug text-muted-foreground/80">
        {CARE_LAW}
        {boardIsLive && hasFix ? ` Listings come from ${careSourceWords(source)}.` : ""}
      </p>
    </section>
  );
}
