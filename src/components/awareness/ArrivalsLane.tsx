// ArrivalsLane — what landed, in the room where landing is the subject.
//
// Every arrival says the same three things, in the same order, as the Telegram
// reply for the same arrival: the read, the arrival itself, and the one next
// move. Nothing here files, answers or sends. Tapping through opens Inbox,
// where filing actually happens.
import { useNavigate } from "react-router-dom";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhySurfaced } from "@/components/ui/why-surfaced";
import { ErrorState, LoadingState } from "@/components/ui/state-views";
import { useArrivals } from "@/hooks/useArrivals";
import { readArrival } from "@/lib/arrivalRead";
import { cn } from "@/lib/utils";

export function ArrivalsLane({ className }: { className?: string }) {
  const { items, held, loading, error, refresh } = useArrivals();
  const navigate = useNavigate();
  const surfaced = items.filter((i) => i.surface);

  return (
    <section className={cn("min-w-0", className)} aria-label="What just arrived">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">What just arrived</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Messages, files and voice notes that came in and have no home yet.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Check again"
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {loading && surfaced.length === 0 ? (
        <LoadingState rows={2} label="Reading what arrived" />
      ) : error ? (
        <ErrorState
          title="Couldn't read what arrived"
          detail="Nothing was lost — try again in a moment."
          onRetry={() => void refresh()}
        />
      ) : surfaced.length === 0 ? (
        <div className="vanta-card rounded-xl p-3">
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Nothing is waiting. Things land here when you send Echo a message, a photo or a voice note from
            Telegram, or add a file in the app.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {surfaced.map((item) => {
            const r = readArrival(item.arrival);
            return (
              <li key={`${item.arrival.channel}:${item.arrival.id}`} className="vanta-card rounded-xl p-3">
                <p className="text-[12px] font-medium leading-snug">{r.read}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-foreground/85">{r.summary}</p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">Next: {r.nextStep}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-[12px]"
                    onClick={() => navigate("/?surface=inbox")}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    Open in Inbox
                  </Button>
                  <WhySurfaced why={item.why} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {held ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">{held}</p> : null}
    </section>
  );
}
