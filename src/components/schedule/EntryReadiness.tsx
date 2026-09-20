// EntryReadiness — what the border expects, asked only of people it applies to.
//
// Shows on a landed international leg. It asks at most two things — "are you
// entering or only changing planes?" and, only when entering a country with a
// vetted arrival-card system, "which country's passport are you carrying?" A
// country name, never a document number. Echo never fills in or submits the
// form; it hands over the official link and keeps a local acknowledgment.
import { useEffect, useState } from "react";
import { Check, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  entryRead,
  type EntryIntent,
  type EntryGuide,
} from "@/lib/entryReadiness";
import { vantaToast } from "@/lib/vantaVoice";

const intentKey = (planId: string) => `echo.entry.intent.${planId}`;
const ackKey = (planId: string) => `echo.entry.ack.${planId}`;

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — the card still works for this visit */
  }
}

function GuideCard({
  guide,
  acked,
  onAck,
  onResetAck,
}: {
  guide: EntryGuide;
  acked: boolean;
  onAck: () => void;
  onResetAck: () => void;
}) {
  if (acked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[12px] text-foreground/90">
          <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
          {guide.cardName} — marked done.
        </p>
        <button
          type="button"
          onClick={onResetAck}
          className="text-[11px] text-muted-foreground underline underline-offset-2"
        >
          Not yet
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-[12.5px] font-medium text-foreground">
        Before immigration: {guide.cardName}
      </p>
      <ul className="space-y-1 text-[11.5px] leading-snug text-foreground/85">
        <li>{guide.whoWords}</li>
        <li>{guide.windowWords}</li>
        <li>{guide.doneWords}</li>
        <li className="text-muted-foreground">{guide.exceptionWords}</li>
      </ul>
      <a
        href={guide.officialUrl}
        target="_blank"
        rel="noreferrer"
        className="vanta-focus inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
      >
        Open the official {guide.country} arrival card
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-200/90">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {guide.scamWords}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{guide.visaWords}</p>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <p className="text-[10.5px] text-muted-foreground">
          Checked {guide.checkedOn} ·{" "}
          {guide.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 ? " · " : ""}
              <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {s.label}
              </a>
            </span>
          ))}
        </p>
        <Button size="sm" variant="outline" className="h-9 shrink-0 text-[12px]" onClick={onAck}>
          I've filed it
        </Button>
      </div>
    </div>
  );
}

export function EntryReadiness({
  planId,
  fromIata,
  toIata,
}: {
  planId: string;
  fromIata: string | null | undefined;
  toIata: string | null | undefined;
}) {
  const { prefs, loading, update } = useUserPreferences();
  const [intent, setIntent] = useState<EntryIntent | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [nat, setNat] = useState("");
  const [savingNat, setSavingNat] = useState(false);

  useEffect(() => {
    setIntent((readLS(intentKey(planId)) as EntryIntent | null) ?? null);
    setAck(readLS(ackKey(planId)));
  }, [planId]);

  const nationality = prefs.entry?.nationality ?? null;
  const read = entryRead({ fromIata, toIata, intent, nationality });

  // Domestic leg, or Echo cannot tell which countries are involved: stay silent.
  if (read.kind === "domestic" || read.kind === "unknown_route") return null;

  const setIntentAndKeep = (next: EntryIntent | null) => {
    setIntent(next);
    writeLS(intentKey(planId), next);
  };

  const saveNationality = async () => {
    const words = nat.trim();
    if (!words) return;
    setSavingNat(true);
    try {
      await update({ entry: { ...(prefs.entry ?? {}), nationality: words } });
      setNat("");
    } catch {
      vantaToast.warning("That did not save. Try again in a moment.");
    } finally {
      setSavingNat(false);
    }
  };

  return (
    <section
      aria-label="Entering the country"
      className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3"
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        At the border
      </p>

      {read.kind === "needs_intent" ? (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-foreground/90">
            {read.toCountry
              ? `You landed in ${read.toCountry} from another country. Are you going through immigration here, or only changing planes?`
              : "You landed from another country. Are you going through immigration here, or only changing planes?"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-11 text-[12.5px]" onClick={() => setIntentAndKeep("enter")}>
              I'm entering
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11 text-[12.5px]"
              onClick={() => setIntentAndKeep("transit")}
            >
              Only changing planes
            </Button>
          </div>
        </div>
      ) : null}

      {read.kind === "not_needed_transit" ? (
        <div className="space-y-1.5">
          <p className="text-[12.5px] leading-snug text-foreground/90">
            Changing planes without passing immigration — no {read.toCountry ? `${read.toCountry} ` : ""}arrival
            card owed. Stay on the transfer route; the board and airline staff outrank anything here.
          </p>
          <button
            type="button"
            onClick={() => setIntentAndKeep(null)}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            Actually, I'm entering
          </button>
        </div>
      ) : null}

      {read.kind === "needs_nationality" ? (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-foreground/90">
            {read.guide.country} asks most foreign visitors for an arrival card. Whether it applies to you
            depends on the passport you're carrying.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1">
              <Label htmlFor="er-nat" className="text-[11px]">
                Country of your passport — the country, never the number
              </Label>
              <Input
                id="er-nat"
                value={nat}
                onChange={(e) => setNat(e.target.value)}
                placeholder="e.g. United States"
                className="h-11"
                autoComplete="off"
              />
            </div>
            <Button
              size="sm"
              className="h-11 text-[12.5px]"
              disabled={!nat.trim() || savingNat || loading}
              onClick={() => void saveNationality()}
            >
              Keep it
            </Button>
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            Kept as one country name in your own settings. Change it any time; Echo never asks for the document itself.
          </p>
        </div>
      ) : null}

      {read.kind === "needed" ? (
        <GuideCard
          guide={read.guide}
          acked={ack === `${read.guide.countryCode}:${read.guide.checkedOn}`}
          onAck={() => {
            const stamp = `${read.guide.countryCode}:${read.guide.checkedOn}`;
            setAck(stamp);
            writeLS(ackKey(planId), stamp);
          }}
          onResetAck={() => {
            setAck(null);
            writeLS(ackKey(planId), null);
          }}
        />
      ) : null}

      {read.kind === "not_needed_national" ? (
        <p className="text-[12.5px] leading-snug text-foreground/90">
          Entering on a {read.guide.country} passport — the {read.guide.cardName} is not owed by nationals.
          Immigration still stamps you in.
        </p>
      ) : null}

      {read.kind === "no_guide" ? (
        <p className="text-[12.5px] leading-snug text-foreground/90">
          {read.toCountry
            ? `Echo keeps no vetted entry notes for ${read.toCountry} — check the official immigration site before you land, and ignore any site that charges for an "arrival card".`
            : "Echo cannot tell which country this airport is in — check the official immigration site for where you land, and ignore any site that charges for an \"arrival card\"."}
        </p>
      ) : null}
    </section>
  );
}
