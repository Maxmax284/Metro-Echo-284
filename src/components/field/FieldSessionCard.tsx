// FieldSessionCard — what a running trip looks like while you're still in it.
//
// Same card in Today and in the Aware room, because it is the same session.
// Today gets the short read; Aware gets the recorded points too. Nothing here
// runs on its own: "I'm here" closes the trip, "Mark a stop" records a point.
import { useState } from "react";
import { Navigation, Flag, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { vantaToast } from "@/lib/vantaVoice";
import { useFieldSession } from "@/hooks/useFieldSession";

export function FieldSessionCard({
  variant = "today",
  className,
}: {
  variant?: "today" | "aware";
  className?: string;
}) {
  const { read, busy, arrive, markStop } = useFieldSession();
  const [showPoints, setShowPoints] = useState(false);

  if (!read) return null;

  return (
    <section className={`vanta-card rounded-xl p-3 ${className ?? ""}`} aria-label="Field session">
      <div className="flex items-center gap-1.5">
        <Navigation className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <MachineLabel className="text-foreground/70">In the field</MachineLabel>
      </div>

      <p className="mt-1.5 text-sm font-medium text-foreground">{read.headline}</p>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{read.read}</p>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{read.summary}</p>
      <p className="mt-1 text-[11px] leading-snug text-foreground/70">{read.nextStep}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-9"
          disabled={busy}
          onClick={async () => {
            const where = await arrive();
            vantaToast.info(where ? `Trip closed at ${where}.` : "Trip closed. No place name on the end.");
          }}
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1.5 h-3.5 w-3.5" />}
          I'm here
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          disabled={busy}
          onClick={async () => {
            await markStop();
            vantaToast.info("Stop recorded.");
          }}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" /> Mark a stop
        </Button>
      </div>

      {variant === "aware" && read.points.length > 0 && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setShowPoints((v) => !v)}
            className="text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {showPoints ? "Hide points" : `Show points — ${read.points.length} recorded`}
          </button>
          {showPoints && (
            <ul className="mt-1.5 space-y-1">
              {read.points.map((p) => (
                <li key={`${p.at}-${p.kind}`} className="text-[11.5px] leading-snug text-muted-foreground">
                  {p.line}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">
            Only points that were actually recorded are listed. Nothing is filled in between them.
          </p>
        </div>
      )}
    </section>
  );
}
