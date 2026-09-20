// EntryReadiness — what the border expects, asked only of people it applies to.
//
// Shows on an international leg: before departure once the flight is within the
// filing window, and again once it has landed. It asks at most two things —
// "are you entering or only changing planes?" and, only when entering a country
// with a vetted arrival-card system, "which country's passport are you
// carrying?" A country name, never a document number. Echo never fills in or
// submits the form; it hands over the official link and keeps a local
// acknowledgment, held per entry so a later domestic hop does not re-ask.
import { useEffect, useState } from "react";
import { Check, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  airportCountry,
  entryRead,
  guideStale,
  type EntryIntent,
  type EntryGuide,
} from "@/lib/entryReadiness";
import { vantaToast } from "@/lib/vantaVoice";

const intentKey = (planId: string) => `echo.entry.intent.${planId}`;
/** Held per country, not per flight: one entry, one filing. */
const entryAckKey = (countryCode: string) => `echo.entry.ack.c.${countryCode}`;
/** What older builds wrote, still honoured so nobody is asked twice. */
const legacyAckKey = (planId: string) => `echo.entry.ack.${planId}`;

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

function windowLine(window: EntryWindow, guide: EntryGuide): string | null {
  if (window.kind === "early") {
    const day = new Date(window.opensAt).toISOString().slice(0, 10);
    return `Too early for the official system: the ${guide.country} window opens ${day}. Echo will say so when it does.`;
  }
  if (window.kind === "open") return `Your ${guide.country} arrival declaration window is open.`;
  return null;
}

function GuideCard({
  guide,
  window: entryWin,
  acked,
  onAck,
  onResetAck,
}: {
  guide: EntryGuide;
  window: EntryWindow;
  acked: boolean;
  onAck: () => void;
  onResetAck: () => void;
}) {
  if (acked) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12px] text-foreground/90">
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
            {guide.cardName} — marked done by you, not verified with {guide.country}.
          </p>
          <button
            type="button"
            onClick={onResetAck}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            Not yet
          </button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Keep the official QR code or confirmation saved offline — airport data is not a plan.
        </p>
      </div>
    );
  }
  const stale = guideStale(guide);
  const opening = windowLine(entryWin, guide);
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-[12.5px] font-medium text-foreground">
        Before immigration: {guide.cardName}
      </p>
      {opening ? <p className="text-[12px] leading-snug text-primary">{opening}</p> : null}
      <ul className="space-y-1 text-[11.5px] leading-snug text-foreground/85">
        <li>{guide.whoWords}</li>
        <li>{guide.windowWords}</li>
        <li>{guide.doneWords}</li>
        <li className="text-muted-foreground">{guide.exceptionWords}</li>
        {guide.free ? <li className="text-muted-foreground">Official cost: nothing.</li> : null}
      </ul>
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Have ready</p>
        <ul className="space-y-1 text-[11.5px] leading-snug text-foreground/85">
          {guide.prepWords.map((line) => (
            <li key={line}>— {line}</li>
          ))}
        </ul>
      </div>
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
      {guide.kioskWords ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{guide.kioskWords}</p>
      ) : null}
      {stale ? (
        <p className="text-[11px] leading-snug text-amber-200/90">
          These words were last checked on {guide.checkedOn} — a while ago now. Read the official page
          before you rely on them.
        </p>
      ) : null}
      <EntryHelp />
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
  when = "after",
}: {
  planId: string;
  fromIata: string | null | undefined;
  toIata: string | null | undefined;
  /** "before" — the flight has not left yet. "after" — it has landed. */
  when?: "before" | "after";
}) {
  const { prefs, loading, update } = useUserPreferences();
  const [intent, setIntent] = useState<EntryIntent | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [nat, setNat] = useState("");
  const [savingNat, setSavingNat] = useState(false);

  const toCountryCode = airportCountry(toIata);

  useEffect(() => {
    setIntent((readLS(intentKey(planId)) as EntryIntent | null) ?? null);
    const country = airportCountry(toIata);
    setAck((country ? readLS(entryAckKey(country)) : null) ?? readLS(legacyAckKey(planId)));
  }, [planId, toIata]);

  const nationality = prefs.entry?.nationality ?? null;
  const filedFor = ack ? ack.split(":")[0] : null;
  const read = entryRead({ fromIata, toIata, intent, nationality, filedFor });

  // A domestic leg with nothing filed, or a route Echo cannot place: stay silent.
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

  const landed = when === "after";

  return (
    <section
      aria-label="Entering the country"
      className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3"
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        At the border
      </p>

      {read.kind === "already_filed" ? (
        <p className="text-[12.5px] leading-snug text-foreground/90">
          {read.guide.cardName} already filed for this entry — this hop stays inside{" "}
          {read.guide.country}, so it is not a new entry and no second card is owed.
        </p>
      ) : null}

      {read.kind === "needs_intent" ? (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-foreground/90">
            {landed
              ? read.toCountry
                ? `You landed in ${read.toCountry} from another country. Are you going through immigration here, or only changing planes?`
                : "You landed from another country. Are you going through immigration here, or only changing planes?"
              : read.toCountry
                ? `This flight lands in ${read.toCountry}. Will you go through immigration there, or only change planes?`
                : "This flight lands in another country. Will you go through immigration there, or only change planes?"}
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
            writeLS(entryAckKey(read.guide.countryCode), stamp);
          }}
          onResetAck={() => {
            setAck(null);
            writeLS(entryAckKey(read.guide.countryCode), null);
            writeLS(legacyAckKey(planId), null);
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
          {read.toCountry ?? toCountryCode
            ? `Echo keeps no vetted entry notes for ${read.toCountry ?? toCountryCode} — check the official immigration site before you land, and ignore any site that charges for an "arrival card".`
            : "Echo cannot tell which country this airport is in — check the official immigration site for where you land, and ignore any site that charges for an \"arrival card\"."}
        </p>
      ) : null}
    </section>
  );
}
