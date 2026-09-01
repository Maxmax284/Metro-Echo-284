// WearableReadingsPanel — real numbers off a real watch, or an honest blank.
//
// Heart rate comes over Bluetooth while you hold the connection open, and only
// while this page is in front of you. Steps, sleep and workouts arrive from a
// phone hand-off. Nothing here approves or runs anything; a reading is context,
// and posture stays something you set by hand.
import { useEffect, useRef, useState } from "react";
import { Activity, Bluetooth, Copy, Footprints, HeartPulse, Loader2, Moon, RefreshCw, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { vantaToast } from "@/lib/vantaVoice";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { POSTURE_LABEL } from "@/lib/awareness";
import { readingLine } from "@/lib/wearable";
import {
  bluetoothAvailable,
  bluetoothUnavailableReason,
  startHeartRate,
  type HeartRateSession,
} from "@/lib/wearableBluetooth";

const btnClass = cn(
  "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
  "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground disabled:opacity-60",
  MOTION_FOCUS,
);

export function WearableReadingsPanel() {
  const { user } = useAuth();
  const { organizationId } = useScope();
  const { loop, loading, error, refresh } = useWearableLoop();
  const [live, setLive] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reading, setReading] = useState(false);
  const [handoff, setHandoff] = useState<{ url: string; token: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const session = useRef<HeartRateSession | null>(null);
  const lastStored = useRef(0);

  /* Never leave a device connected behind a closed page. */
  useEffect(() => {
    return () => {
      void session.current?.stop();
      session.current = null;
    };
  }, []);

  const hrOn = loop.consent.heart_rate === true;
  const activityOn = loop.consent.activity === true;

  const connect = async () => {
    if (!hrOn) {
      vantaToast.info({
        title: "Heart rate is switched off",
        description: "Turn it on under Senses below, then connect.",
      });
      return;
    }
    setConnecting(true);
    try {
      const s = await startHeartRate((bpm) => {
        setLive(bpm);
        /* One stored reading a minute. A live number is for you; the record is
           for Vanta, and it doesn't need every beat. */
        const now = Date.now();
        if (now - lastStored.current < 60_000) return;
        lastStored.current = now;
        if (!user) return;
        void supabase
          .from("wearable_readings")
          .insert({
            user_id: user.id,
            organization_id: organizationId ?? null,
            kind: "heart_rate",
            value: bpm,
            unit: "bpm",
            measured_at: new Date().toISOString(),
            source: "bluetooth",
          })
          .then(() => refresh());
      });
      session.current = s;
      vantaToast.success({
        title: `Reading ${s.deviceName}`,
        description: "One reading is kept a minute, while this page stays open.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The device didn't connect.";
      vantaToast.error({
        title: "No watch connected",
        description: /cancel|user/i.test(msg) ? "Nothing was picked, so nothing changed." : msg,
      });
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await session.current?.stop();
    session.current = null;
    setLive(null);
    vantaToast.info({
      title: "Watch disconnected",
      description: "Nothing is being read. What was already stored stays.",
    });
  };

  const readNow = async () => {
    setReading(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("wearable-sweep", { body: {} });
      if (err) throw err;
      const total =
        Number((data as any)?.people ?? 0) > 0 ? "The day was totted up." : "Nothing was counted.";
      vantaToast.info({ title: "Watch read", description: total });
      refresh();
    } catch (e) {
      vantaToast.error({
        title: "The read didn't run",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setReading(false);
    }
  };

  const makeLink = async () => {
    setLinking(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("wearable-link", { body: {} });
      if (err) throw err;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      setHandoff({ url: String((data as any).url), token: String((data as any).token) });
    } catch (e) {
      vantaToast.error({
        title: "The link wasn't made",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setLinking(false);
    }
  };

  if (loading) return <LoadingState label="Reading your watch…" />;
  if (error) return <ErrorState error={error} doing="reading your watch" onRetry={refresh} />;

  return (
    <section className="vanta-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Activity className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight">What your watch is saying</h2>
          <p className="text-[12px] text-muted-foreground">
            {loop.lastSyncAgo ? `Last read ${loop.lastSyncAgo}.` : "Vanta hasn't read it yet."}
          </p>
        </div>
        <button type="button" onClick={() => void readNow()} disabled={reading} className={cn(btnClass, "ml-auto")}>
          {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Read now
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {/* Heart rate — live while connected */}
        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <HeartPulse className="h-3.5 w-3.5 shrink-0 text-primary" />
            <MachineLabel className="text-foreground/70">Heart rate</MachineLabel>
            <MachineText className="text-[10px] text-muted-foreground">
              {live !== null ? `${live} bpm live` : hrOn ? "not connected" : "off"}
            </MachineText>
            {session.current ? (
              <button type="button" onClick={() => void disconnect()} className={cn(btnClass, "ml-auto")}>
                <Square className="h-3.5 w-3.5" />
                Stop reading
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={connecting || !bluetoothAvailable()}
                title={bluetoothAvailable() ? undefined : bluetoothUnavailableReason()}
                className={cn(btnClass, "ml-auto")}
              >
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
                Connect a watch
              </button>
            )}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            {live !== null
              ? `${live} bpm, straight off the strap. One reading a minute is kept.`
              : readingLine("heart_rate", loop.heartRate, hrOn)}
          </p>
          {!bluetoothAvailable() ? (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {bluetoothUnavailableReason()}
            </p>
          ) : null}
        </div>

        {/* Steps */}
        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Footprints className="h-3.5 w-3.5 shrink-0 text-primary" />
            <MachineLabel className="text-foreground/70">Steps today</MachineLabel>
            <MachineText className="text-[10px] text-muted-foreground">
              {activityOn ? (loop.stepsToday !== null ? `${loop.stepsToday}` : "nothing yet") : "off"}
            </MachineText>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            {loop.stepsToday !== null && activityOn
              ? `${loop.stepsToday} steps recorded today, sent from your phone.`
              : readingLine("steps", null, activityOn)}
          </p>
        </div>

        {/* Sleep */}
        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Moon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <MachineLabel className="text-foreground/70">Sleep</MachineLabel>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            {readingLine("sleep", loop.sleep, activityOn)}
          </p>
        </div>

        {/* What the read found */}
        <div className="vanta-inset px-3 py-2">
          <MachineLabel className="text-foreground/70">Last read found</MachineLabel>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">{loop.sweepLine}</p>
        </div>

        {/* Posture suggestion — never a switch */}
        {loop.suggestion ? (
          <div className="vanta-inset px-3 py-2">
            <MachineLabel className="text-foreground/70">Vanta noticed</MachineLabel>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {loop.suggestion.because} You might be in “{POSTURE_LABEL[loop.suggestion.posture]}”. Set
              it below if that's right — Vanta won't switch it for you.
            </p>
          </div>
        ) : null}

        {/* Phone hand-off */}
        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <MachineLabel className="text-foreground/70">Phone hand-off</MachineLabel>
            <button type="button" onClick={() => void makeLink()} disabled={linking} className={cn(btnClass, "ml-auto")}>
              {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              {handoff ? "New link" : "Get my link"}
            </button>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            Steps, sleep and workouts come from your phone, not from Vanta reaching out. Point a
            Shortcut or a health export at this address and the numbers land here.
          </p>
          {handoff ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(`${handoff.url}?token=${handoff.token}`)
                  .then(() =>
                    vantaToast.success({
                      title: "Link copied",
                      description: "Paste it into your Shortcut. Treat it like a key.",
                    }),
                  );
              }}
              className={cn(
                "mt-2 block w-full break-all rounded-[2px] border border-border/60 bg-background/40 px-2 py-1.5 text-left font-mono text-[10.5px] text-foreground/80",
                MOTION_FOCUS,
              )}
            >
              {handoff.url}?token={handoff.token.slice(0, 8)}… <span className="text-muted-foreground">(tap to copy)</span>
            </button>
          ) : null}
        </div>
      </div>

      <AftermathHint text="Readings are context only. They can nudge what Vanta says and when it holds a note — they can never approve or run anything, and they never leave through Telegram." />
    </section>
  );
}
