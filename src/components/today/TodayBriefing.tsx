// TodayBriefing — the debrief of what's happening today, as it happens.
//
// Deterministic truth first (situationReducer), Echo's take on top. Echo's take
// is conservative: it composes on its own at most once an hour and only when
// the briefing actually changed; the server caps it at 4/hour, 12/day.
// Acknowledge stamps the card until something new lands.
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check, ArrowRight, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reduceSituation, type SituationEvent } from "@/lib/situationReducer";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";

const ACK_KEY = "vanta.today.ack";
const TAKE_KEY = "vanta.today.take";
const AUTO_GAP_MS = 60 * 60_000;

type Cached = { signature: string; text: string; at: number };

function readTake(): Cached | null {
  try { return JSON.parse(localStorage.getItem(TAKE_KEY) ?? "null"); } catch { return null; }
}

export function TodayBriefing(props: {
  events: SituationEvent[];
  place: string | null;
  overdue: number;
  waiting: number;
  dueToday: number;
  loading: boolean;
  onOpenMoved: (e: React.MouseEvent) => void;
}) {
  const brief = useMemo(() => reduceSituation(props.events), [props.events]);
  const clear = brief.situations.length === 0;
  const [ackSig, setAckSig] = useState(() => localStorage.getItem(ACK_KEY));
  const acked = !clear && ackSig === brief.signature;
  const [take, setTake] = useState<Cached | null>(readTake);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justStamped, setJustStamped] = useState(false);

  const compose = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("today-take", {
      body: {
        place: props.place,
        overdue: props.overdue,
        waiting: props.waiting,
        dueToday: props.dueToday,
        situations: brief.situations.slice(0, 12).map((s) => ({ label: s.label, count: s.count })),
      },
    });
    setBusy(false);
    const msg = (data as any)?.error ?? (error ? "Echo couldn't read the day right now." : null);
    if (msg || !(data as any)?.take) { setErr(msg ?? "Echo came back empty."); return; }
    const next = { signature: brief.signature, text: (data as any).take as string, at: Date.now() };
    localStorage.setItem(TAKE_KEY, JSON.stringify(next));
    setTake(next);
  };

  /* Conservative auto-take: only when there is something, it changed, and an hour has passed. */
  useEffect(() => {
    if (props.loading || clear || busy) return;
    const c = readTake();
    if (c?.signature === brief.signature) return;
    if (c && Date.now() - c.at < AUTO_GAP_MS) return;
    void compose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.loading, brief.signature]);

  const acknowledge = () => {
    localStorage.setItem(ACK_KEY, brief.signature);
    setAckSig(brief.signature);
    setJustStamped(true);
    play("stamp");
    window.setTimeout(() => setJustStamped(false), 900);
  };

  if (props.loading) return null;

  if (clear) {
    return (
      <div className="today-allclear relative mt-2 overflow-hidden rounded-md border border-border/50 bg-card/40 px-3 py-2.5">
        <span aria-hidden className="today-allclear-sweep" />
        <div className="relative flex items-center gap-2">
          <span className="die-sticker sticker-slap inline-flex items-center gap-1 rounded-sm border-2 border-background bg-success px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-success-foreground shadow-md">
            <Check className="h-3 w-3" /> All clear
          </span>
          <span className="text-[12px] text-muted-foreground">Nothing's moved today that needs you.</span>
        </div>
        {brief.plumbing > 0 ? (
          <button type="button" onClick={props.onOpenMoved} className="relative mt-1 min-h-[36px] text-[11px] text-muted-foreground/80 underline-offset-2 hover:underline">
            {brief.plumbing} routine background receipts, folded away
          </button>
        ) : null}
      </div>
    );
  }

  const fresh = take && take.signature === brief.signature;
  return (
    <div className={cn("relative mt-2 rounded-md border border-border/50 bg-card/40 px-3 py-3", acked && "opacity-80")}>
      {acked ? (
        <span aria-hidden className={cn("pointer-events-none absolute right-3 top-2 rotate-[-8deg] rounded-sm border-2 border-primary px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.2em] text-primary", justStamped && "receipt-stamp-heavy")}>
          Seen
        </span>
      ) : null}
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        <Sparkles className={cn("h-3.5 w-3.5 text-accent", busy && "animate-pulse")} /> Echo's take
      </div>
      <p className="mt-1.5 pr-14 text-[14px] leading-snug text-foreground animate-fade-in" key={fresh ? take!.at : "none"}>
        {busy ? "Reading your day…" : fresh ? take!.text : err ?? "Tap refresh for Echo's read of today."}
      </p>
      <ul className="mt-2 space-y-1">
        {brief.situations.slice(0, 4).map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-[12.5px] animate-fade-in" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="truncate">{s.label}</span>
            {s.count > 1 ? <span className="vanta-machine text-muted-foreground">· {s.count}×</span> : null}
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!acked ? (
          <button type="button" onClick={acknowledge} className="min-h-[44px] rounded-md border border-border px-3 text-[12px] font-medium hover-scale">
            Got it
          </button>
        ) : null}
        <button type="button" onClick={props.onOpenMoved} className="inline-flex min-h-[44px] items-center gap-1 px-2 text-[12px] text-primary">
          Show the receipts <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={busy} onClick={() => void compose()} aria-label="Refresh Echo's take" className="ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground">
          <RotateCw className={cn("h-4 w-4", busy && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}
