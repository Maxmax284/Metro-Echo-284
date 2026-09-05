// TripPanel — Start trip / End trip, plus what you've covered.
//
// Running state is always visible while a trip is open, so a forgotten trip
// never reads as silent tracking. Nothing starts on its own; every trip can be
// deleted; an auto-close says what it could not know.
import { useState } from "react";
import { MapPin, Play, Square, Flag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MachineLabel } from "@/components/ui/instrument";
import { vantaToast } from "@/lib/vantaVoice";
import { useTrips } from "@/hooks/useTrips";
import {
  formatDistance,
  runningLine,
  thisWeekLine,
  tripSummaryLine,
} from "@/lib/trips";

export function TripPanel({ placeLabel }: { placeLabel?: string | null }) {
  const {
    trips, running, liveDistanceM, loading, busy,
    autoCloseNote, dismissAutoCloseNote,
    startTrip, endTrip, markStop, deleteTrip,
  } = useTrips();
  const [purpose, setPurpose] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const finished = trips.filter((t) => t.ended_at);
  const week = thisWeekLine(trips);

  return (
    <div className="vanta-card rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <MachineLabel className="text-foreground/70">Trips</MachineLabel>
      </div>

      {autoCloseNote && (
        <div className="rounded-lg border border-border/60 bg-surface-elevated/30 p-2.5 text-[12px] leading-snug text-muted-foreground">
          {autoCloseNote}
          <Button variant="ghost" size="sm" className="mt-1 h-6 px-2 text-[11px]" onClick={dismissAutoCloseNote}>
            Got it
          </Button>
        </div>
      )}

      {running ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{runningLine(running, liveDistanceM)}</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Started {running.start_label ? `at ${running.start_label}` : "without a place name"}
            {running.purpose ? ` · ${running.purpose}` : ""}. Points are only recorded while this page is open.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={async () => {
                const d = await endTrip(placeLabel ?? null);
                vantaToast.info(`Trip ended. ${formatDistance(d)}.`);
              }}
            >
              <Square className="mr-1.5 h-3.5 w-3.5" /> End trip
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy}
              onClick={async () => {
                await markStop(placeLabel ?? null);
                vantaToast.info("Stop marked.");
              }}
            >
              <Flag className="mr-1.5 h-3.5 w-3.5" /> Mark a stop
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            {week ?? "No trips recorded yet. Start one and Vanta measures the distance and how long it took."}
          </p>
          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="What's this trip for? (optional)"
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={async () => {
              const t = await startTrip({ purpose: purpose.trim() || null, startLabel: placeLabel ?? null });
              setPurpose("");
              vantaToast.info(t ? "Trip running. End it when you get there." : "Couldn't start the trip.");
            }}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" /> Start trip
          </Button>
        </div>
      )}

      {finished.length > 0 && (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {showHistory ? "Hide history" : `Show history — ${finished.length} recorded`}
          </button>
          {showHistory && (
            <ul className="space-y-1.5">
              {finished.slice(0, 20).map((t) => (
                <li key={t.id} className="flex items-start gap-2 border-t border-border/30 pt-1.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-foreground">{tripSummaryLine(t)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.started_at).toLocaleString()}
                      {t.closed_by === "auto_stale" ? " · closed by Vanta, end unknown" : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={async () => {
                      await deleteTrip(t.id);
                      vantaToast.info("Trip deleted.");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete trip</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && trips.length === 0 && (
        <p className="vanta-machine text-[11px] tracking-[0.08em] text-muted-foreground/80">Reading your trips…</p>
      )}
    </div>
  );
}
