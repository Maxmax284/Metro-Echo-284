// GatePass — gate mode. What a person walking through a terminal actually needs,
// large and first: boarding time, gate, seat, zone.
//
// Doctrine:
//   - Boarding time is not departure time. A departure alone buys a labelled
//     planning window and nothing more.
//   - A confirmed reading is never replaced by an estimate, and the source of
//     each fact is named on the card.
//   - Disagreements are shown, not settled. The live display and the gate staff
//     settle them.
//   - The pass photo is read once and kept by nobody. Saving is the person's tap,
//     after they have read what Echo pulled out.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, PencilLine, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { vantaToast } from "@/lib/vantaVoice";
import type { FlightPlan } from "@/lib/flightPlan";
import {
  LOCAL_SOURCE_WORDS,
  gateProvenance,
  localTransferFacts,
  type LocalFactSource,
  type LocalTransferVerification,
} from "@/lib/transferVerification";
import {
  PASS_SOURCE_CHOICES,
  boardingInstant,
  boardingRead,
  cleanDraft,
  draftEmpty,
  passCells,
  passConflicts,
  untilWords,
  type PassDraft,
} from "@/lib/gatePass";
import { SolariBoard } from "./SolariBoard";

export function GatePass({
  plan,
  flightLabel,
  providerGate,
  departAt,
  departLocal,
  arriveLocal,
  fmt,
  online,
  onSave,
}: {
  plan: FlightPlan;
  /** What the terminal prints — the operating number. */
  flightLabel: string;
  providerGate?: string | null;
  /** The departure instant, anchored at the airport it leaves from. */
  departAt?: string | null;
  /** The same departure, read on the departure airport's clock. */
  departLocal?: string | null;
  /** The landing, read on the arrival airport's clock. */
  arriveLocal?: string | null;
  /** Reads an instant on the departure airport's own clock. */
  fmt: (iso: string) => string;
  online: boolean;
  onSave: (facts: Omit<LocalTransferVerification, "verified_at">) => Promise<void>;
}) {
  const local = localTransferFacts(plan);
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const read = useMemo(() => boardingRead({ local, departAt, fmt }), [local, departAt, fmt]);
  const gate = gateProvenance(providerGate, local);
  const cells = passCells(local);
  const conflicts = passConflicts({ providerGate, providerDepartLocal: departLocal, local });
  const boardingAt = read.kind === "confirmed" ? boardingInstant({ boarding: read.time, departAt, departLocal }) : null;
  const countdown = untilWords(boardingAt, now);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PassDraft>({
    boarding_time: local?.boarding_time ?? "",
    gate: local?.gate ?? "",
    seat: local?.seat ?? "",
    zone: local?.zone ?? "",
  });
  const [source, setSource] = useState<LocalFactSource>(local?.source ?? "boarding_pass");
  const [reviewing, setReviewing] = useState<PassDraft | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lookAtPass = async (file: File) => {
    setLooking(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("That picture could not be opened."));
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("boarding-pass-read", {
        body: { image, plan_id: plan.id },
      });
      if (error) throw new Error(error.message);
      const got = cleanDraft((data as { read?: PassDraft })?.read ?? {});
      if (draftEmpty(got)) {
        vantaToast.warning("Nothing readable came off that picture. Type the details instead.");
        setOpen(true);
        return;
      }
      setReviewing(got);
      setSource("boarding_pass");
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That picture could not be read.");
    } finally {
      setLooking(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (d: PassDraft) => {
    const clean = cleanDraft(d);
    if (draftEmpty(clean)) {
      vantaToast.warning("Nothing to save yet.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        gate: clean.gate,
        boarding_time: clean.boarding_time,
        seat: clean.seat,
        zone: clean.zone,
        baggage_status: local?.baggage_status ?? "unknown",
        transfer_route: local?.transfer_route ?? "unknown",
        source,
      });
      vantaToast.success("Kept on this flight, on your word, with a receipt.");
      setReviewing(null);
      setOpen(false);
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "Those details did not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2.5 rounded-md border border-primary/35 bg-primary/[0.04] p-2.5" aria-label="Gate mode">
      <div className="flex items-baseline gap-2">
        <p className="vanta-machine-label text-primary/85">Boarding today</p>
        <p className="ml-auto font-mono text-[11.5px] text-foreground/80">{flightLabel}</p>
      </div>

      {/* The four things that get a person on the aircraft. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="space-y-1">
          <SolariBoard text={gate.value === "Not on record" ? "—" : gate.value} label="Gate" tone={gate.value === "Not on record" ? "default" : "primary"} />
          <p className="text-[10px] leading-snug text-muted-foreground/85">
            {gate.value === "Not on record" ? "Not on record — check the board" : gate.source}
          </p>
        </div>
        <div className="space-y-1">
          <SolariBoard
            text={read.kind === "confirmed" ? read.time : read.kind === "estimate" ? read.window : "—"}
            label={read.kind === "confirmed" ? "Boarding" : read.kind === "estimate" ? "Boarding (approx window)" : "Boarding"}
            tone={read.kind === "confirmed" ? "primary" : "warn"}
          />
          <p className="text-[10px] leading-snug text-muted-foreground/85">
            {read.kind === "confirmed"
              ? `${read.sourceWords}${countdown ? ` · boarding ${countdown}` : ""}`
              : read.kind === "estimate"
                ? read.words
                : read.words}
          </p>
        </div>
        {cells.map((c) => (
          <div key={c.label} className="space-y-1">
            <SolariBoard text={c.value} label={c.label} tone={c.value === "—" ? "default" : "primary"} />
            <p className="text-[10px] leading-snug text-muted-foreground/85">{c.note}</p>
          </div>
        ))}
      </div>

      {/* Wheels-up and landing stay on the card, one line, behind the gate facts. */}
      <p className="border-t border-border/50 pt-2 text-[11.5px] text-foreground/80">
        {departLocal ? `Departs ${departLocal}` : "No departure time filed"}
        {arriveLocal ? ` · lands ${arriveLocal}` : ""}
        <span className="text-muted-foreground/80"> · airline schedule, local at each airport</span>
      </p>

      {conflicts.map((c) => (
        <p key={c} className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] leading-snug text-foreground/90">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          {c}
        </p>
      ))}

      {/* Intake: a photo you review, or four fields you type. */}
      {reviewing ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <p className="text-[11.5px] text-foreground/90">
            Read off that pass. Nothing is saved until you say so, and the picture was not kept.
          </p>
          <ul className="space-y-0.5 font-mono text-[11.5px] text-foreground/85">
            <li>Boarding {reviewing.boarding_time ?? "— not printed"}</li>
            <li>Gate {reviewing.gate ?? "— not printed"}</li>
            <li>Seat {reviewing.seat ?? "— not printed"}</li>
            <li>Zone {reviewing.zone ?? "— not printed"}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-9 text-[12px]" disabled={busy} onClick={() => void save(reviewing)}>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
              Keep these
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-[12px]"
              disabled={busy}
              onClick={() => {
                setDraft(reviewing);
                setReviewing(null);
                setOpen(true);
              }}
            >
              <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
              Fix one
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-[12px]" disabled={busy} onClick={() => setReviewing(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : open ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["boarding_time", "Boarding time", "15:15"],
              ["gate", "Gate", "A2"],
              ["seat", "Seat", "7F"],
              ["zone", "Zone", "3"],
            ] as const).map(([key, label, hint]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`gp-${key}`} className="text-[11px] text-muted-foreground">{label}</Label>
                <Input
                  id={`gp-${key}`}
                  value={draft[key] ?? ""}
                  placeholder={hint}
                  inputMode={key === "boarding_time" ? "numeric" : "text"}
                  className="h-9 text-[12.5px]"
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Where did this come from?</p>
            <div className="flex flex-wrap gap-1.5">
              {PASS_SOURCE_CHOICES.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={source === c.id ? "default" : "outline"}
                  className="h-8 text-[11.5px]"
                  onClick={() => setSource(c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-[10.5px] leading-snug text-muted-foreground/85">
            Kept as {LOCAL_SOURCE_WORDS[source].toLowerCase()} — your word, on this flight, with a receipt. Blank fields
            stay blank; Echo works nothing out from the departure time.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-9 text-[12px]" disabled={busy} onClick={() => void save(draft)}>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
              Keep these
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-[12px]" disabled={busy} onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-9 text-[12px]" onClick={() => setOpen(true)}>
            <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
            {local ? "Change these" : "Type your pass details"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-[12px]"
            disabled={looking || !online}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="mr-1 h-3.5 w-3.5" aria-hidden />
            {looking ? "Reading your pass" : online ? "Read a photo of it" : "No signal to read a photo"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Photo of your boarding pass"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lookAtPass(f);
            }}
          />
        </div>
      )}
      {local?.verified_at && (
        <p className={cn("text-[10px] text-muted-foreground/80")}>
          Your pass details are kept on this flight and stay readable with no signal.
        </p>
      )}
    </section>
  );
}
