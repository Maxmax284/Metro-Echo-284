// RadarCard — Today's post for everything Echo is keeping an eye on.
//
// Always on the board, even at zero: an empty radar teaches how a watch is
// born (ask Echo, say "keep an eye on it") instead of hiding the capability.
// Quiet checks stay quiet here too — "nothing has moved" is one line, not a
// feed. Failure is a visible state, never silence.
//
// A row is a bulletin line: tap it and the dispatch slip opens in place —
// full goal, what Echo saw, the recorded sweep log, and the call-box
// controls — without leaving Today. "Check now" stays on the row for the
// quick hit; Echo is one door further, inside the slip, never the default.
import { useState } from "react";
import { ChevronRight, Radar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useWatches } from "@/hooks/useWatches";
import {
  WATCH_TONE,
  CHECKABLE_WATCH_STATES,
  checkNowLine,
  checkWatchNow,
} from "@/lib/watch";
import { radarModel, quietHeadline } from "@/lib/radar";
import { SolariBoard } from "@/components/schedule/SolariBoard";
import { WatchDispatchSheet } from "@/components/today/WatchDispatchSheet";

export function RadarCard() {
  const { items, loading, refresh } = useWatches({ openOnly: false, limit: 30 });
  const navigate = useNavigate();
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return null;
  const model = radarModel(items);

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

  /* The slip reads the live row, so a check landed while it stands open
     shows the new truth without closing. */
  const openWatch = openId ? (items.find((w) => w.id === openId) ?? null) : null;

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
              const checkable = (CHECKABLE_WATCH_STATES as string[]).includes(r.state);
              return (
                <li key={r.id} className="vanta-inset px-3 py-2">
                  <button
                    onClick={() => setOpenId(r.id)}
                    className="flex w-full items-start gap-2 text-left"
                    aria-label={`Open the dispatch slip for ${r.goal}`}
                  >
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
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                          WATCH_TONE[r.state],
                        )}
                      >
                        {r.stateLabel}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </button>
                  {checkable && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3">
                      <button
                        onClick={() => void checkNow(r.id)}
                        disabled={checkingId !== null}
                        className="min-h-[36px] text-[11px] text-primary hover:underline disabled:opacity-50"
                      >
                        {checkingId === r.id ? "Checking…" : "Check now"}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <WatchDispatchSheet
        watch={openWatch}
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        onChanged={refresh}
      />
    </div>
  );
}
