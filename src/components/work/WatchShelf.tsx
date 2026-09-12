// WatchShelf — the long-running jobs, sitting where work already lives.
//
// No separate room, no automation centre. Six words of state, one honest line
// underneath from recorded checks only, and one way out: Stop.
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useWatches } from "@/hooks/useWatches";
import { WATCH_LABEL, WATCH_TONE, stopWatch, watchLine } from "@/lib/watch";
import { supabase } from "@/integrations/supabase/client";

export function WatchShelf() {
  const { items, loading, refresh } = useWatches();

  if (loading || items.length === 0) return null;

  const stop = async (id: string) => {
    try {
      await stopWatch(id);
      toast.success("Stopped. Echo will not check that again.");
      refresh();
    } catch {
      toast.error("Could not stop that one.");
    }
  };

  const checkNow = async () => {
    await supabase.functions.invoke("watch-sweep", { body: {} }).catch(() => null);
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
        {items.map((w) => (
          <li key={w.id} className="vanta-inset px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{w.goal}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {watchLine(w)}
                </span>
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
            <button
              onClick={() => void stop(w.id)}
              className="mt-1.5 min-h-[36px] text-[11px] text-muted-foreground hover:text-foreground"
            >
              Stop
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
