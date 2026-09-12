// AddPlaceForm — seed your own places by hand.
//
// Nothing here guesses: the coordinates come from the address you picked off
// the map search, and the category and notes are your words, stored as given.
// Saving a place never switches where Echo is reading from.
import { useState } from "react";
import { Loader2, MapPinPlus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MachineLabel } from "@/components/ui/instrument";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { searchPlaces, type PlaceSearchHit } from "@/lib/locationSanity";
import { cn } from "@/lib/utils";

export const PLACE_CATEGORIES = [
  "Home",
  "Work",
  "Stay",
  "Gym",
  "Clinic",
  "Food",
  "Transit",
  "Other",
] as const;

export function AddPlaceForm({
  onSaved,
  className,
}: {
  onSaved?: () => void | Promise<void>;
  className?: string;
}) {
  const { session } = useAuth();
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [notes, setNotes] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const [picked, setPicked] = useState<PlaceSearchHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHits([]);
    try {
      const out = await searchPlaces(query);
      setHits(out);
      if (out.length === 0) toast.error("No address matched that. Try a street and a city.");
    } catch {
      toast.error("Address lookup didn't answer. Try again in a moment.");
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!session || !picked) return;
    const name = label.trim() || picked.city || picked.display_name.split(",")[0];
    setSaving(true);
    try {
      const { error } = await supabase.from("awareness_places").insert({
        user_id: session.user.id,
        label: name,
        address: picked.display_name,
        category,
        notes: notes.trim() || null,
        country: picked.country ?? null,
        region: picked.region ?? null,
        geo: {
          lat: picked.lat,
          lon: picked.lon,
          source: "manual",
          city: picked.city ?? null,
          display_name: picked.display_name,
        },
      });
      if (error) throw error;
      toast.success({
        title: `Saved ${name}`,
        description: "It's on your places list. Echo is still reading from where it was.",
      });
      setLabel("");
      setQuery("");
      setNotes("");
      setCategory("Other");
      setPicked(null);
      setHits([]);
      await onSaved?.();
    } catch {
      toast.error("Couldn't save that place. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn("vanta-card rounded-xl p-3", className)} aria-label="Add a place">
      {/* Phone-width law: the desk doesn't open with an empty form in the way.
          The door says what's behind it; the fields arrive when you ask. */}
      <button
        type="button"
        onClick={() => setFormOpen((v) => !v)}
        aria-expanded={formOpen}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <MapPinPlus className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <MachineLabel className="text-foreground/70">Add a place</MachineLabel>
        <span className="ml-auto text-[11px] text-muted-foreground">{formOpen ? "Close" : "Open"}</span>
      </button>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Type an address, pick the match, and it joins your places with its category and your notes.
      </p>

      <div className={cn("mt-2 space-y-2", !formOpen && "hidden")}>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Address — 3940 Centreville Rd, Chantilly VA"
            className="h-10"
          />
          <Button
            variant="outline"
            className="h-10 shrink-0"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            aria-label="Search address"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {hits.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-surface-elevated/40 p-1">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(h);
                    setHits([]);
                    setQuery(h.display_name);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[12px] leading-snug text-foreground hover:bg-primary/10"
                >
                  {h.display_name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {picked ? (
          <p className="rounded-lg border border-border/40 bg-surface-elevated/30 px-2.5 py-2 text-[11px] leading-snug text-foreground/85">
            Using {picked.display_name}
          </p>
        ) : null}

        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name it (optional) — Wingate Chantilly"
          className="h-10"
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {PLACE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — gate code, front desk hours, who to ask for"
          rows={2}
          maxLength={500}
        />

        <Button className="h-10 w-full" onClick={save} disabled={saving || !picked}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {picked ? "Save this place" : "Pick an address first"}
        </Button>
      </div>
    </section>
  );
}
