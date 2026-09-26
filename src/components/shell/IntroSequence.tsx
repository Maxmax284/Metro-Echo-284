// IntroSequence — the first boarding, once per account.
//
// Not a tour and not a carousel: one station card that says what this place
// is, the four rooms, and the two house rules — then the shutter lifts
// straight into Today. It holds until the person steps in or skips; reading
// time is theirs. Finishing writes the flag to the account, so the Google
// sign-in round trip can never bypass it, and records a boot so the roll
// call doesn't fire a second ceremony on the same landing.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SolariWord } from "@/components/today/SignalBeacon";
import { supabase } from "@/integrations/supabase/client";
import { BOOT_ENCORE_KEY } from "@/lib/bootSequence";
import { recordBoot } from "@/lib/bootStorage";
import { INTRO_COPY, introMirrorKey } from "@/lib/introSequence";
import { reducedMotion } from "@/lib/reducedMotion";
import { play } from "@/lib/streetSound";

export function IntroSequence({ userId, onFinished }: { userId: string; onFinished: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reducedMotion()) return;
    play("turnstile", { gain: 0.7 });
    timers.current.push(window.setTimeout(() => play("clack", { gain: 0.5 }), 900));
    timers.current.push(window.setTimeout(() => play("clack", { gain: 0.4 }), 1900));
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    if (!reducedMotion()) play("stamp", { gain: 0.4 });
    const seenAt = new Date().toISOString();
    try {
      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", userId)
        .maybeSingle();
      const prefs = ((data?.preferences as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      await supabase
        .from("profiles")
        .update({ preferences: { ...prefs, intro_seen_at: seenAt } })
        .eq("id", userId);
    } catch {
      /* The mirror below still spares a replay on this device; the account
         flag simply gets written on the next online open instead. */
    }
    try {
      localStorage.setItem(introMirrorKey(userId), "1");
      /* The intro IS the arrival ceremony: burn the sign-in encore so the
         roll call doesn't fire again on this landing. */
      localStorage.removeItem(BOOT_ENCORE_KEY);
    } catch {
      /* private window */
    }
    recordBoot();
    setLeaving(true);
    timers.current.push(window.setTimeout(onFinished, 480));
  };

  return (
    <div
      className={cn(
        "boot-sequence fixed inset-0 z-[100] flex items-center justify-center px-6",
        leaving && "boot-sequence-out",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Metro Echo"
    >
      <div className="boot-box w-full max-w-[340px] rounded-md border border-border/70 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="echo-lens echo-lens-live is-lit h-2.5 w-2.5 rounded-full" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {INTRO_COPY.header}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {INTRO_COPY.tag}
          </span>
        </div>

        <div className="mt-3">
          <SolariWord word={INTRO_COPY.drum} />
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{INTRO_COPY.lead}</p>
        </div>

        <div className="mt-3 space-y-1.5">
          {INTRO_COPY.rooms.map((room) => (
            <p key={room.name} className="text-[12px] leading-snug">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground">
                {room.name}
              </span>{" "}
              <span className="text-muted-foreground">— {room.line}</span>
            </p>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-border/60 pt-2.5">
          {INTRO_COPY.rules.map((rule) => (
            <p key={rule} className="text-[11px] leading-snug text-muted-foreground">
              — {rule}
            </p>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" className="h-9 flex-1" disabled={busy} onClick={() => void finish()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : INTRO_COPY.stepIn}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-[11px]"
            disabled={busy}
            onClick={() => void finish()}
          >
            {INTRO_COPY.skip}
          </Button>
        </div>

        <div className="desk-transit-track mt-3.5 h-[3px] w-full overflow-hidden rounded-full">
          <span className="desk-transit-run block h-full w-1/3 rounded-full" aria-hidden />
        </div>
      </div>
    </div>
  );
}
