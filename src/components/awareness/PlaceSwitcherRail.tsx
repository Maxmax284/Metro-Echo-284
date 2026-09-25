// PlaceSwitcherRail — one tap to move the board between the places you keep.
//
// Doctrine:
//   - The live fix is always first and always labelled live, so a saved board is
//     never mistaken for where you are standing.
//   - Switching only changes what you are reading. It never moves your fix and
//     never writes anything.
//   - Adding a place to read is explicit and named by you. Echo resolves the
//     town from a free lookup and says so; it never guesses silently.
import { useState } from "react";
import { Loader2, MapPin, Plus, Radio, X } from "lucide-react";
import { play } from "@/lib/streetSound";
import { cn } from "@/lib/utils";

export type SwitchablePlace = {
  id: string;
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

/** Short, readable word for the rail — the town, not the full address. */
function chipName(p: SwitchablePlace): string {
  const name = p.city ?? p.label;
  return name.split(",")[0].trim().slice(0, 22);
}

export function PlaceSwitcherRail({
  places,
  activeId,
  liveId,
  onSelect,
  onAdd,
  className,
}: {
  places: SwitchablePlace[];
  /** Which place the board is reading right now. */
  activeId: string | null;
  /** The place holding your current device fix, if any. */
  liveId: string | null;
  onSelect: (id: string) => void;
  /** Resolve a town the person names and keep it. Returns an error line, or null. */
  onAdd?: (name: string) => Promise<string | null>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const town = name.trim();
    if (!town || !onAdd) return;
    setBusy(true); setErr(null);
    const problem = await onAdd(town);
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setName(""); setOpen(false);
    play("tick", { gain: 0.4 });
  }

  if (places.length === 0 && !onAdd) return null;

  return (
    <div className={cn("relative", className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Your places
      </p>
      <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {places.map((p) => {
          const on = p.id === (activeId ?? liveId);
          const live = p.id === liveId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (!on) { onSelect(p.id); play("tick", { gain: 0.4 }); } }}
              aria-pressed={on}
              className={cn(
                "field-tab inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[3px] border px-2.5 text-[12px] font-medium",
                on
                  ? "border-primary/55 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {live ? <Radio className="h-3.5 w-3.5 text-primary/80" /> : <MapPin className="h-3.5 w-3.5" />}
              <span className="truncate">{chipName(p)}</span>
              {live ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary/80">live</span>
              ) : p.country ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  {p.country.slice(0, 12)}
                </span>
              ) : null}
            </button>
          );
        })}

        {onAdd ? (
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); setErr(null); play("tick", { gain: 0.35 }); }}
            className="field-tab inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[3px] border border-dashed border-border/70 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            Add a place
          </button>
        ) : null}
      </div>

      {open && onAdd ? (
        <div className="mt-2 rounded-[3px] border border-border/60 bg-surface-elevated/30 p-2.5">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Town or city, like Bangkok"
              autoFocus
              className="min-h-[40px] flex-1 rounded-[3px] border border-border/60 bg-background px-2.5 text-[13px] outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !name.trim()}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[3px] border border-primary/55 bg-primary/10 px-3 text-[12px] font-medium text-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Keep it
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            This only adds a place to read. Your own location stays where it is.
          </p>
          {err ? <p className="mt-1 text-[11.5px] text-warn">{err}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
