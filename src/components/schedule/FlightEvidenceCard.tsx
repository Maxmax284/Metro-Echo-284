// FlightEvidenceCard — what Echo read later, and what you want done about it.
//
// Doctrine:
//   - A picture is evidence, not authority. Where a later reading disagrees with
//     the flight on record, nothing is written until you say which is right.
//   - Two plain answers, both recorded: keep the record, or file the reading.
//   - Airline-owned facts (status, gate, terminal) never reach this card, so
//     they can never be settled from a screenshot.
//   - A sentence that makes something wait on this flight becomes a promise only
//     when you keep it.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";
import { vantaToast } from "@/lib/vantaVoice";
import { planTitle, type FlightPlan } from "@/lib/flightPlan";
import { cn } from "@/lib/utils";
import { MOTION_PRESS } from "@/lib/motion";

export function FlightEvidenceCard({
  plans,
  onSettle,
  onKeepCondition,
  onLookUp,
}: {
  plans: FlightPlan[];
  onSettle: (plan: FlightPlan, key: string, choice: "keep" | "accept") => Promise<string>;
  onKeepCondition: (plan: FlightPlan) => Promise<string>;
  onLookUp: (plan: FlightPlan) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const open = plans.filter(
    (p) =>
      (p.noticed_from?.conflicts ?? []).length > 0 ||
      (p.noticed_from?.condition && !p.noticed_from.condition.kept_at),
  );
  if (open.length === 0) return null;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      vantaToast.success(await work());
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="vanta-card space-y-3 p-3">
      <div className="flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-[13px] font-medium">Echo read something later</p>
      </div>
      <ul className="space-y-3">
        {open.map((p) => {
          const conflicts = p.noticed_from?.conflicts ?? [];
          const condition = p.noticed_from?.condition ?? null;
          return (
            <li key={p.id} className="space-y-2 border-l-2 border-primary/50 pl-2">
              <p className="text-[13px] text-foreground/90">{planTitle(p)}</p>
              {conflicts.map((c) => (
                <div key={`${c.key}-${c.seen}`} className="space-y-1.5">
                  <p className="text-[12.5px] leading-snug text-foreground/85">
                    You have {c.filed}. {c.source_words ? `What Echo read off ${c.source_words}` : "The later reading"}{" "}
                    says {c.seen}. Nothing has been changed.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      className={cn("h-9 text-[12px]", MOTION_PRESS)}
                      disabled={busy}
                      onClick={() => void run(() => onSettle(p, c.key, "keep"))}
                    >
                      Keep {c.filed}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-9 text-[12px]", MOTION_PRESS)}
                      disabled={busy}
                      onClick={() => void run(() => onSettle(p, c.key, "accept"))}
                    >
                      File {c.seen} instead
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn("h-9 text-[12px]", MOTION_PRESS)}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onLookUp(p);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Ask the airline
                    </Button>
                  </div>
                </div>
              ))}
              {condition && !condition.kept_at && (
                <div className="space-y-1.5">
                  <p className="text-[12.5px] leading-snug text-foreground/85">
                    Something is waiting on this flight: “{condition.words}”
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn("h-9 text-[12px]", MOTION_PRESS)}
                    disabled={busy}
                    onClick={() => void run(() => onKeepCondition(p))}
                  >
                    Keep it as a promise
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground/80">
        Times, places, codes and names can be settled here. Status, gate and terminal only ever come from the airline
        feed — a picture never sets those.
      </p>
    </Card>
  );
}
