// WearableLoop — the watch loop as its own page.
//
// Same shape as the paper-and-phone page: the plain rules, the live readings,
// and one walk that only ticks a step when a record proves it.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Check, Circle, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { MOTION_ROW } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { WearableReadingsPanel } from "@/components/wearables/WearableReadingsPanel";
import { PostureSection } from "@/components/settings/PostureSection";
import { SensorConsentSection } from "@/components/settings/SensorConsentSection";
import { useWearableLoop } from "@/hooks/useWearableLoop";

const STEPS = [
  "Switch on the senses you want. Off means nothing is read and nothing is stored.",
  "Connect a strap for heart rate, or point your phone's health export at your private link.",
  "The numbers land here as context — never as instructions.",
  "You set the posture. Vanta may suggest one; it never flips it for you.",
  "Today reads it back in Your body, and the day's read reports what changed.",
];

export default function WearableLoopPage() {
  const { loop, loading, error, refresh } = useWearableLoop();
  const [sending, setSending] = useState(false);
  const activityOn = loop.consent.activity === true;

  /* Sends one real workout reading through your private hand-off link, exactly
     as your phone would. It stores a record; it approves and runs nothing. */
  const sendTestWorkout = async () => {
    setSending(true);
    try {
      const { data: link, error: linkErr } = await supabase.functions.invoke("wearable-link", {
        body: {},
      });
      if (linkErr) throw linkErr;
      const url = String((link as any)?.url ?? "");
      const token = String((link as any)?.token ?? "");
      if (!url || !token) throw new Error("The hand-off link could not be read.");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          readings: [
            { kind: "workout", value: 45, unit: "min", measured_at: new Date().toISOString() },
          ],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((body as any)?.error ?? "The hand-off refused it."));

      vantaToast.success({
        title: "A 45 minute workout landed",
        description: "It shows in Your body on Today and on the Work desk line.",
      });
      refresh();
    } catch (e) {
      vantaToast.error({
        title: "Nothing was sent",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Vanta"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">The watch loop</h1>
          <p className="text-xs text-muted-foreground">
            From your wrist to Today, without your watch ever taking the wheel.
          </p>
        </div>
      </header>

      <section className="vanta-card mb-4 p-4">
        <h2 className="text-[14px] font-semibold tracking-tight">The loop</h2>
        <ol className="mt-2 space-y-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-2 text-[12px] leading-snug text-foreground/90">
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
          A watch feeds Vanta. It never controls it. Approval doesn't travel to your wrist, and
          nothing here goes out through Telegram.
        </p>
      </section>

      <section className="vanta-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <MachineLabel className="text-foreground/70">Where it shows up</MachineLabel>
        <Link
          to="/watch"
          className="vanta-focus ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40"
        >
          See the trends
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        <Link
          to="/"
          className="vanta-focus inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40"
        >
          Your body on Today
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={() => void sendTestWorkout()}
          disabled={sending || !activityOn}
          title={activityOn ? undefined : "Daily activity is switched off, so nothing can be stored."}
          className="vanta-focus inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send a test workout
        </button>
        <p className="w-full text-[11px] leading-snug text-muted-foreground">
          The test workout is a real reading through your own hand-off link — the same path your
          phone uses. It stores 45 minutes and nothing else. Pairing a strap still has to happen on
          the device in your hand.
        </p>
      </section>

      <div className="mb-4">
        <WearableReadingsPanel />
      </div>

      <section className="vanta-card mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <MachineLabel className="text-foreground/70">Walk the loop</MachineLabel>
          <MachineText className="text-[10px] text-muted-foreground">
            {loop.progress.done} of {loop.progress.total} proved
          </MachineText>
        </div>
        {error ? (
          <ErrorState error={error} doing="checking your watch loop" onRetry={refresh} />
        ) : loading ? (
          <LoadingState label="Checking the loop…" />
        ) : (
          <ol className="mt-2 space-y-1.5">
            {loop.steps.map((s, i) => (
              <li key={s.key} className={cn("flex items-start gap-2 rounded-[2px] px-1 py-1", MOTION_ROW)}>
                {s.state === "done" ? (
                  <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Circle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium leading-snug text-foreground">
                    {i + 1}. {s.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{s.line}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <AftermathHint text="Every line above comes from a stored reading or a recorded event. A step stays open until something proves it." />
      </section>

      <PostureSection />
      <SensorConsentSection />
    </div>
  );
}
