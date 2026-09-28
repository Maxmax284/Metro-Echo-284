// WatchShelf — the long-running jobs, sitting where work already lives.
//
// No separate room, no automation centre. Six words of state, one honest line
// underneath from recorded checks only, and one way out: Stop.
//
// A finished watch is the whole point of a watch, so it stays here for a day
// with what it found. Clearing it is the user's move, not Echo's.
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useWatches } from "@/hooks/useWatches";
import { WATCH_LABEL, WATCH_TONE, OPEN_WATCH_STATES, stopWatch, pauseWatch, resumeWatch, watchLine, type Watch } from "@/lib/watch";
import { checkWords } from "@/lib/radar";
import { supabase } from "@/integrations/supabase/client";

const RECENT_MS = 24 * 3_600_000;

function isOpen(w: Watch): boolean {
  return (OPEN_WATCH_STATES as string[]).includes(w.state);
}

/** Open or paused, plus anything that ended recently enough to still be news. */
function worthShowing(w: Watch): boolean {
  if (isOpen(w) || w.state === "paused") return true;
  const at = new Date(w.updated_at ?? w.created_at).getTime();
  return Number.isFinite(at) && Date.now() - at < RECENT_MS;
}

export function WatchShelf() {
  const { items, loading, refresh } = useWatches({ openOnly: false, limit: 30 });
  const shown = items.filter(worthShowing);
  const settled = shown.filter((w) => !isOpen(w) && w.state !== "paused");

  if (loading) return null;

  /* The shelf never hides the capability: at zero it teaches how a watch is
     born instead of vanishing from the desk. */
  if (shown.length === 0) {
    return (
      <div className="vanta-card p-3">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-medium">Echo is keeping an eye on</h3>
        </div>
        <p className="mt-2 vanta-inset px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Nothing yet. Ask Echo about something — a page, an event, a booking — and say keep an eye on it; the watch lands here with its checks and a way to stop it.
        </p>
      </div>
    );
  }

  const stop = async (id: string, goal: string) => {
    try {
      await stopWatch(id, goal);
      toast.success("Stopped. Echo will not check that again.");
      refresh();
    } catch {
      toast.error("Could not stop that one.");
    }
  };

  const pause = async (id: string, goal: string) => {
    try {
      await pauseWatch(id, goal);
      toast.success("Paused — Echo is not checking this right now.");
      refresh();
    } catch {
      toast.error("Could not pause that one.");
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

  const checkNow = async () => {
    await supabase.functions.invoke("watch-sweep", { body: {} }).catch(() => null);
    refresh();
  };

  /* Clearing removes the card, never the receipt: the audit row stays. */
  const clearSettled = async () => {
    const ids = settled.map((w) => w.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("watches").delete().in("id", ids);
    if (error) toast.error("Could not clear those.");
    refresh();
  };

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">Echo is keeping an eye on</h3>
        <button
          onClick={() => void checkNow()}
          className="ml-auto min-h-[36px] text-xs text-primary hover:underline"
        >
          Check now
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {shown.map((w) => (
          <li key={w.id} className="vanta-inset px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{w.goal}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {watchLine(w)}
                </span>
                {isOpen(w) || w.state === "paused" ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/80">
                    {checkWords(w)}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                  WATCH_TONE[w.state],
                )}
              >
                {WATCH_LABEL[w.state]}
              </span>
            </div>
            {isOpen(w) ? (
              <span className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => void pause(w.id, w.goal)}
                  className="min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Pause
                </button>
                <button
                  onClick={() => void stop(w.id, w.goal)}
                  className="min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Stop
                </button>
              </span>
            ) : w.state === "paused" ? (
              <span className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => void resume(w.id, w.goal)}
                  className="min-h-[36px] text-[11px] text-primary hover:underline"
                >
                  Resume
                </button>
                <button
                  onClick={() => void stop(w.id, w.goal)}
                  className="min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Stop
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {settled.length > 0 ? (
        <button
          onClick={() => void clearSettled()}
          className="mt-2 min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
        >
          Clear settled
        </button>
      ) : null}
    </div>
  );
}
