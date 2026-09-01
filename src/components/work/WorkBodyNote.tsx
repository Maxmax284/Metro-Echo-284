// WorkBodyNote — the posture and sensor line inside "Where things stand".
//
// It says which senses are on, what posture you set, and how rest weighs
// against training. Body facts shape how the desk speaks; they never create,
// route, approve or run work.
import { Activity } from "lucide-react";
import { MachineText } from "@/components/ui/instrument";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { POSTURE_LABEL } from "@/lib/awareness";
import { restBalance, workBodyContext } from "@/lib/wearable";

export function WorkBodyNote() {
  const { loop, loading } = useWearableLoop();
  const { context } = useVantaContext();
  if (loading || !loop.anySensorOn) return null;

  const posture = context.posture ?? null;
  const body = workBodyContext({
    anySensorOn: loop.anySensorOn,
    readings: loop.readings,
    posture,
    sweep: loop.sweep,
    postureActedAt: null,
  });
  const rest = restBalance(loop.readings);

  const senses = [
    loop.consent.heart_rate === true ? "heart rate" : null,
    loop.consent.activity === true ? "daily activity" : null,
  ].filter(Boolean) as string[];

  const parts: string[] = [];
  parts.push(posture ? `You set ${POSTURE_LABEL[posture]}` : "No posture set");
  if (rest.line) parts.push(rest.line);
  if (!rest.line && senses.length) parts.push(`${senses.join(" and ")} switched on`);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Activity className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
      <MachineText className="text-[10px] text-muted-foreground">
        {parts.join(" · ")}
      </MachineText>
      {body.because ? (
        <span className="text-[11px] leading-snug text-amber-400/90">{body.because}</span>
      ) : null}
    </div>
  );
}
