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
import { radarModel, quietHeadline, type RadarModel, type RadarRow } from "@/lib/radar";
import { SolariBoard } from "@/components/schedule/SolariBoard";
import { WatchDispatchSheet } from "@/components/today/WatchDispatchSheet";
import { reducedMotion } from "@/lib/reducedMotion";

/* ── Tactical scope ──────────────────────────────────────────────────────── */

/** Deterministic blip position from the watch id — never random. */
function blipAngle(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 360) * Math.PI) / 180;
}

function blipRadius(idx: number, total: number): number {
  // Spread blips across rings: inner ring for first, mid for second, outer for rest.
  if (total <= 1) return 22;
  const ring = idx % 3;
  return [16, 26, 36][ring];
}

function blipColor(row: RadarRow): string {
  if (row.needsAttention) return "hsl(var(--warn))";
  if (row.state === "paused") return "hsl(var(--muted-foreground))";
  return "hsl(var(--primary))";
}

function RadarScope({ model, checkingId }: { model: RadarModel; checkingId: string | null }) {
  if (model.kind === "empty") return null;
  const rows = model.rows;
  const sweeping = checkingId !== null;
  const rm = reducedMotion();

  return (
    <div className="relative mx-auto mt-2" style={{ width: 120, height: 120 }}>
      <svg viewBox="0 0 100 100" width={120} height={120} className="block">
        <defs>
          <radialGradient id="scope-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.14)" />
            <stop offset="100%" stopColor="hsl(var(--surface-elevated) / 0)" />
          </radialGradient>
          <linearGradient id="scope-sweep-grad" x1="50%" y1="50%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.4)" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
          </linearGradient>
          <linearGradient id="scope-sweep-grad-fast" x1="50%" y1="50%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--warn) / 0.5)" />
            <stop offset="100%" stopColor="hsl(var(--warn) / 0)" />
          </linearGradient>
        </defs>

        {/* backdrop */}
        <circle cx="50" cy="50" r="48" fill="url(#scope-bg)" />

        {/* rings */}
        {[16, 30, 44].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
            strokeWidth={0.4}
          />
        ))}

        {/* crosshair */}
        <line x1="50" y1="2" x2="50" y2="98" stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={0.3} />
        <line x1="2" y1="50" x2="98" y2="50" stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={0.3} />

        {/* sweep */}
        {!rm && (
          <g className={sweeping ? "radar-sweep" : "radar-sweep"} style={sweeping ? { animationDuration: "1.2s" } : undefined}>
            <path
              d="M50,50 L50,2 A48,48 0 0 1 95,28 Z"
              fill={sweeping ? "url(#scope-sweep-grad-fast)" : "url(#scope-sweep-grad)"}
            />
          </g>
        )}

        {/* blips */}
        {rows.map((row, i) => {
          const angle = blipAngle(row.id);
          const dist = blipRadius(i, rows.length);
          const cx = 50 + dist * Math.cos(angle);
          const cy = 50 + dist * Math.sin(angle);
          const color = blipColor(row);
          const r = row.needsAttention ? 2.2 : 1.6;
          return (
            <g key={row.id} className="radar-fade-in" style={{ animationDelay: `${i * 0.15}s` }}>
              <circle cx={cx} cy={cy} r={5} fill="transparent" />
              <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.95} />
              {!rm && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.5}
                  className="radar-ping-pulse"
                  style={{ animationDelay: `${i * 0.4}s` }}
                />
              )}
              <title>{row.goal} — {row.stateLabel}</title>
            </g>
          );
        })}

        {/* center dot */}
        <circle cx="50" cy="50" r="1.2" fill="hsl(var(--primary))" />
      </svg>
    </div>
  );
}

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
          {/* The tactical scope — rings, sweep, one blip per watch. */}
          <RadarScope model={model} checkingId={checkingId} />

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
