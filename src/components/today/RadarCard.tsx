// RadarCard — Today's post for everything Echo is keeping an eye on.
//
// Always on the board, even at zero: an empty radar teaches how a watch is
// born (ask Echo, say "keep an eye on it") instead of hiding the capability.
// Quiet checks stay quiet here too — "nothing has moved" is one line, not a
// feed. Failure is a visible state, never silence.
//
// Every row is a call-box: "Check now" forces a real check this second (the
// schedule never makes you wait when you asked), and "Ask Echo" opens a
// debrief on that watch with the question already typed. When Echo read
// something, the row shows the headline it actually saw.
import { useState } from "react";
import { MessageSquare, Radar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useWatches } from "@/hooks/useWatches";
import { useAskContext } from "@/hooks/useAskContext";
import {
  WATCH_TONE,
  OPEN_WATCH_STATES,
  CHECKABLE_WATCH_STATES,
  checkNowLine,
  checkWatchNow,
  stopWatch,
  resumeWatch,
} from "@/lib/watch";
import { debriefPrompt, radarModel, quietHeadline, type RadarRow } from "@/lib/radar";
import { SolariBoard } from "@/components/schedule/SolariBoard";

export function RadarCard() {
  const { items, loading, refresh } = useWatches({ openOnly: false, limit: 30 });
  const navigate = useNavigate();
  const { openAskWithContext } = useAskContext();
  const [checkingId, setCheckingId] = useState<string | null>(null);

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

  /* A forced check answers out loud: what Echo found, or that nothing moved. */
  const checkNow = async (id: string) => {
    if (checkingId) return;
    setCheckingId(id);
    try {
      const res = await checkWatchNow(id);
      toast.success(checkNowLine(res));
      refresh();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setCheckingId(null);
    }
  };

  /* The debrief hands Echo the watch and the question — never sent for you. */
  const debrief = (r: RadarRow) => {
    void openAskWithContext({
      kind: "watch",
      id: r.id,
      label: r.goal,
      question: debriefPrompt(r.goal),
      expand: true,
    });
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
          {/* The bulletin's status line is a real departure board: when the
              answer changes, the flaps riffle and land on the new truth.
              Unchanged words hold still — the clack is an event, not a loop. */}
          <SolariBoard
            className="mt-2"
            tone={model.kind === "attention" ? "warn" : "default"}
            text={model.kind === "quiet" ? quietHeadline(model.openCount) : model.headline}
          />
          <ul className="mt-2 space-y-1.5">
            {model.rows.map((r) => {
              const open = (OPEN_WATCH_STATES as string[]).includes(r.state);
              const checkable = (CHECKABLE_WATCH_STATES as string[]).includes(r.state);
              return (
                <li key={r.id} className="vanta-inset px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{r.goal}</span>
                      {r.latest && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-foreground/80">
                          Top of the board: {r.latest}
                        </span>
                      )}
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
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3">
                    <button
                      onClick={() => debrief(r)}
                      className="inline-flex min-h-[36px] items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Ask Echo
                    </button>
                    {checkable && (
                      <button
                        onClick={() => void checkNow(r.id)}
                        disabled={checkingId !== null}
                        className="min-h-[36px] text-[11px] text-primary hover:underline disabled:opacity-50"
                      >
                        {checkingId === r.id ? "Checking…" : "Check now"}
                      </button>
                    )}
                    {open ? (
                      <button
                        onClick={() => void stop(r.id, r.goal)}
                        className="min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Stop
                      </button>
                    ) : r.state === "paused" ? (
                      <button
                        onClick={() => void resume(r.id, r.goal)}
                        className="min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Resume
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
