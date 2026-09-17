// BodyDesk — the body log as a desk: numbers you recorded, medication you take.
//
// Doctrine:
//   - Echo records and reports. It never reads a number as a verdict, never
//     says a level is fine or bad, never offers advice. One standing line says
//     so on the page.
//   - A dose is a reminder. Marking it taken stays the person's; Echo does not
//     tick it for them.
//   - Blood pressure is typed the way a cuff shows it and stored as its parts,
//     so nothing has to be unpacked later.
//   - Calm and archival: paper, tape, stamps. No charts pretending to be care.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Check, Pause, Pill, Plus, Thermometer, Trash2, Weight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useBody } from "@/hooks/useBody";
import { vantaToast } from "@/lib/vantaVoice";
import {
  BODY_DISCLAIMER,
  DOSE_LAW,
  cleanTime,
  dosesOn,
  kindWord,
  latestByKind,
  moveWords,
  nextDose,
  pairBloodPressure,
  parseBloodPressure,
  readingWords,
} from "@/lib/bodyLog";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

function stamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function BodyDesk() {
  const { readings, meds, loading, error, refresh, logReading, addMedication, setMedicationActive, removeMedication } =
    useBody();

  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [bp, setBp] = useState("");
  const [temp, setTemp] = useState("");
  const [tempUnit, setTempUnit] = useState<"°C" | "°F">("°C");
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medTimes, setMedTimes] = useState("08:00");
  const [busy, setBusy] = useState(false);

  const latest = useMemo(() => latestByKind(readings), [readings]);
  const cuff = useMemo(
    () => pairBloodPressure(readings.filter((r) => r.kind.startsWith("bp_") || r.kind === "pulse")).slice(0, 5),
    [readings],
  );
  const today = useMemo(() => dosesOn(meds, new Date()), [meds]);
  const next = useMemo(() => nextDose(meds, new Date()), [meds]);

  const saveReadings = async () => {
    const rows: Array<{ kind: string; value: number; unit: string }> = [];
    if (weight.trim()) {
      const v = Number(weight);
      if (!Number.isFinite(v) || v <= 0) return vantaToast.warning("That weight was not a number Echo could record.");
      rows.push({ kind: "weight", value: v, unit: weightUnit });
    }
    if (temp.trim()) {
      const v = Number(temp);
      if (!Number.isFinite(v) || v <= 0) return vantaToast.warning("That temperature was not a number Echo could record.");
      rows.push({ kind: "temperature", value: v, unit: tempUnit });
    }
    if (bp.trim()) {
      const parsed = parseBloodPressure(bp);
      if (!parsed) return vantaToast.warning("Blood pressure reads as two numbers, like 128/82.");
      rows.push({ kind: "bp_systolic", value: parsed.systolic, unit: "mmHg" });
      rows.push({ kind: "bp_diastolic", value: parsed.diastolic, unit: "mmHg" });
      if (parsed.pulse) rows.push({ kind: "pulse", value: parsed.pulse, unit: "bpm" });
    }
    if (!rows.length) return vantaToast.warning("Nothing was typed to record.");
    setBusy(true);
    try {
      await logReading(rows);
      setWeight("");
      setBp("");
      setTemp("");
      vantaToast.success("Recorded as you typed it.");
    } catch {
      vantaToast.warning("That reading could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveMed = async () => {
    if (!medName.trim()) return vantaToast.warning("A medication needs a name.");
    const times = medTimes
      .split(/[,\s]+/)
      .map((t) => cleanTime(t))
      .filter((t): t is string => !!t);
    if (!times.length) return vantaToast.warning("Give at least one time of day, like 08:00.");
    setBusy(true);
    try {
      await addMedication({ name: medName.trim(), dose: medDose.trim(), times_local: times });
      setMedName("");
      setMedDose("");
      vantaToast.success("Course added. Echo will say when a dose is due.");
    } catch {
      vantaToast.warning("That course could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Reading your body log…" />;
  if (error) return <ErrorState detail={error} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-3">
      <p className="vanta-machine-label text-foreground/60">{BODY_DISCLAIMER}</p>

      {/* Where a device gets linked. One place, said plainly, so the desk and the
          day are never two different stories. */}
      <Link
        to="/how/watch"
        className={cn(
          "vanta-card flex items-center justify-between gap-3 p-3 transition-colors hover:bg-surface-elevated",
          MOTION_FOCUS,
        )}
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold tracking-tight">
            {fromDevice ? "A device is sending readings" : "Link a watch, band, ring or strap"}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {fromDevice
              ? `Newest arrival ${SOURCE_LABEL[fromDevice.source]} · ${stamp(fromDevice.measured_at)}. Anything it sends lands on this desk and in Your body on Today.`
              : "Nothing is sending yet. Set it up once and its numbers land on this desk and in Your body on Today. A device never approves anything."}
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>



      {/* Where things stand — the newest of each number, and its own movement. */}
      <Card className="vanta-card p-3">
        <p className="vanta-machine-label mb-2 text-foreground/70">Last recorded</p>
        {latest.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Nothing recorded yet. Type a weight, a cuff reading or a temperature below and it lands here with its stamp.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {latest.map((r) => (
              <li key={r.kind} className="flex items-baseline gap-2 border-l-2 border-border/70 pl-2">
                <span className="w-28 shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {kindWord(r.kind)}
                </span>
                <span className="text-[13px] text-foreground/90">{readingWords(r)}</span>
                <span className="ml-auto text-[11px] text-muted-foreground/80">{stamp(r.measured_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {latest.some((r) => r.kind === "weight") && moveWords(readings, "weight") && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">Weight {moveWords(readings, "weight")}.</p>
        )}
      </Card>

      {/* Record something. Three fields, each optional, all typed by hand. */}
      <Card className="vanta-card space-y-3 p-3">
        <p className="vanta-machine-label text-foreground/70">Record a reading</p>

        <div className="flex items-center gap-2">
          <Weight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="Weight"
            aria-label="Weight"
            className="h-11"
          />
          <button
            type="button"
            onClick={() => setWeightUnit(weightUnit === "kg" ? "lb" : "kg")}
            aria-label={`Weight unit, currently ${weightUnit}`}
            className={cn("h-11 w-14 shrink-0 rounded-[2px] border border-border/60 text-[12px]", MOTION_FOCUS)}
          >
            {weightUnit}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <Input
            value={bp}
            onChange={(e) => setBp(e.target.value)}
            placeholder="Blood pressure, e.g. 128/82"
            aria-label="Blood pressure"
            className="h-11"
          />
        </div>

        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <Input
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            inputMode="decimal"
            placeholder="Temperature"
            aria-label="Temperature"
            className="h-11"
          />
          <button
            type="button"
            onClick={() => setTempUnit(tempUnit === "°C" ? "°F" : "°C")}
            aria-label={`Temperature unit, currently ${tempUnit}`}
            className={cn("h-11 w-14 shrink-0 rounded-[2px] border border-border/60 text-[12px]", MOTION_FOCUS)}
          >
            {tempUnit}
          </button>
        </div>

        <Button onClick={() => void saveReadings()} disabled={busy} className="h-11 w-full">
          <Check className="mr-2 h-4 w-4" aria-hidden /> Record it
        </Button>
      </Card>

      {cuff.length > 0 && (
        <Card className="vanta-card p-3">
          <p className="vanta-machine-label mb-2 text-foreground/70">Cuff readings</p>
          <ul className="space-y-1">
            {cuff.map((c) => (
              <li key={c.measured_at} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="text-foreground/90">{c.text}</span>
                <span className="ml-auto text-[11px] text-muted-foreground/80">{stamp(c.measured_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Medication. A course with clock times; a reminder, never an action. */}
      <Card className="vanta-card space-y-3 p-3">
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" aria-hidden />
          <p className="vanta-machine-label text-foreground/70">Medication</p>
          {next && (
            <span className="ml-auto text-[11.5px] text-primary/90">Next at {next.time}</span>
          )}
        </div>

        {meds.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No course recorded. Add one with its times and the doses show on the day, here and on the board.
          </p>
        ) : (
          <ul className="space-y-2">
            {meds.map((m) => (
              <li key={m.id} className="flex items-start gap-2 border-l-2 border-border/70 pl-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[13px]", m.active ? "text-foreground/90" : "text-muted-foreground line-through")}>
                    {m.name} {m.dose && <span className="text-muted-foreground">· {m.dose}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.times_local.join(", ") || "no times set"}
                    {m.active ? "" : " · paused"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={m.active ? `Pause ${m.name}` : `Resume ${m.name}`}
                  onClick={() => void setMedicationActive(m.id, !m.active)}
                  className={cn("shrink-0 rounded-[2px] border border-border/60 p-2", MOTION_FOCUS)}
                >
                  {m.active ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => void removeMedication(m.id)}
                  className={cn("shrink-0 rounded-[2px] border border-border/60 p-2", MOTION_FOCUS)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-border/50 pt-3">
          <Input value={medName} onChange={(e) => setMedName(e.target.value)} placeholder="Name" aria-label="Medication name" className="h-11" />
          <div className="flex gap-2">
            <Input value={medDose} onChange={(e) => setMedDose(e.target.value)} placeholder="Dose, e.g. 10mg" aria-label="Dose" className="h-11" />
            <Input value={medTimes} onChange={(e) => setMedTimes(e.target.value)} placeholder="08:00, 20:00" aria-label="Times of day" className="h-11" />
          </div>
          <Button variant="outline" onClick={() => void saveMed()} disabled={busy} className="h-11 w-full">
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Add a course
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">{DOSE_LAW}</p>
      </Card>

      {today.length > 0 && (
        <Card className="vanta-card p-3">
          <p className="vanta-machine-label mb-2 text-foreground/70">Today's doses</p>
          <ul className="space-y-1">
            {today.map((d, i) => (
              <li key={`${d.med.id}-${d.time}-${i}`} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="w-14 shrink-0 tabular-nums text-foreground/70">{d.time}</span>
                <span className="truncate text-foreground/90">
                  {d.med.name}
                  {d.med.dose ? ` · ${d.med.dose}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AftermathHint text="Readings and doses also show on the day you tap on the Board." />
    </div>
  );
}
