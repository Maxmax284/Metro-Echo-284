// RadarCard — Today's post for everything Echo is keeping an eye on.
//
// Always on the board, even at zero: an empty radar teaches how a watch is
// born (ask Echo, say "keep an eye on it") instead of hiding the capability.
// Quiet checks stay quiet here too — "nothing has moved" is one line, not a
// feed. Failure is a visible state, never silence.
import { Radar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useWatches } from "@/hooks/useWatches";
import { WATCH_TONE, OPEN_WATCH_STATES, stopWatch, resumeWatch } from "@/lib/watch";
import { radarModel, quietHeadline } from "@/lib/radar";

export function RadarCard() {
  const { items, loading, refresh } = useWatches({ openOnly: false, limit: 30 });
  const navigate = useNavigate();

  if (loading) return null;
  const model = radarModel(items);

  const stop = async (id: string, goal: string) => {
    try {
      await stopWatch(id, goal);
      toast.success("Stopped. Echo will not check that again.");
      refresh();
    } catch {
      toast.error("Could not stop that one.");
    }
  };

  const resume = async (id: string, goal: string) => {
    try {
      await resumeWatch(id, goal);
      toast.success("Back on it — the next check runs on schedule.");
      refresh();
    } catch {
      toast.error("Could not resume that one.");
    }
  };

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <Radar className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">On the radar</h3>
        {model.kind !== "empty" && (
          <button
            onClick={() => navigate("/?surface=work")}
            className="ml-auto min-h-[36px] text-xs text-primary hover:underline"
          >
            Manage
          </button>
        )}
      </div>

      {model.kind === "empty" ? (
        <div className="mt-2 vanta-inset px-3 py-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Nothing on the radar yet. Ask Echo about something in the world — a storm, a page, a flight — and say{" "}
            <span className="text-foreground">keep an eye on it</span>. That's how things land here.
          </p>
          <button
            onClick={() => navigate("/?surface=ask")}
            className="mt-1.5 min-h-[36px] text-[11.5px] text-primary hover:underline"
          >
            Ask Echo something
          </button>
        </div>
      ) : (
        <>
          <p className={cn(
            "mt-2 text-[11.5px] leading-snug",
            model.kind === "attention" ? "text-foreground" : "text-muted-foreground",
          )}>
            {model.kind === "quiet" ? quietHeadline(model.openCount) : model.headline}
          </p>
          <ul className="mt-2 space-y-1.5">
            {model.rows.map((r) => (
              <li key={r.id} className="vanta-inset px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{r.goal}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {r.check}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                      WATCH_TONE[r.state],
                    )}
                  >
                    {r.stateLabel}
                  </span>
                </div>
                {(OPEN_WATCH_STATES as string[]).includes(r.state) ? (
                  <button
                    onClick={() => void stop(r.id, r.goal)}
                    className="mt-1.5 min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Stop
                  </button>
                ) : r.state === "paused" ? (
                  <button
                    onClick={() => void resume(r.id, r.goal)}
                    className="mt-1.5 min-h-[36px] text-[11px] text-primary hover:underline"
                  >
                    Resume
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
