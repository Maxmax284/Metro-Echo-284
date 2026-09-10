// WorkBodyLine — how your body reads at the desk.
//
// Body facts are context for tone, never a driver of work. Nothing here creates
// a task, routes a note or approves anything: it says what was measured and,
// when the numbers are loud, that Work is leading short because of it.
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { workBodyContext } from "@/lib/wearable";

export function WorkBodyLine() {
  const { loop, loading } = useWearableLoop();
  const { context } = useVantaContext();
  if (loading || !loop.anySensorOn) return null;

  const body = workBodyContext({
    anySensorOn: loop.anySensorOn,
    readings: loop.readings,
    posture: context.posture ?? null,
    sweep: loop.sweep,
    postureActedAt: null,
  });


  if (!body.line) return null;

  return (
    <div className="vanta-inset flex flex-wrap items-center gap-2 px-3 py-2" aria-label="Your body at the desk">
      <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <MachineLabel className="text-foreground/70">Your body</MachineLabel>
      <MachineText className="text-[10px] text-muted-foreground">{body.line}</MachineText>
      {body.because ? (
        <span className="text-[11px] leading-snug text-muted-foreground">{body.because}</span>
      ) : null}
      <Link
        to="/watch"
        className={cn(
          "ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
          MOTION_FOCUS,
        )}
      >
        Body trends
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
