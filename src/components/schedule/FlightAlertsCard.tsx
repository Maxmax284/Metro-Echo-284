// FlightAlertsCard — turning on "tell me when my flight changes" without going
// anywhere near Telegram setup.
//
// Doctrine:
//   - Three separate switches, because they are three different promises. A note
//     in Today, a push on this phone, a message in chat. None is assumed.
//   - The phone row is honest about where it cannot work: a preview window and a
//     dev host cannot register this device, and it says so instead of failing
//     quietly. On iPhone, the phone has to be installed first.
//   - Echo reports what changed and leaves a receipt. Nothing here approves,
//     rebooks or pays for anything.
import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/lib/auth";
import { vantaToast } from "@/lib/vantaVoice";
import { getStatus, pushSupported, subscribeToPush, swAllowedHere, type PushStatus } from "@/lib/pushClient";

export function FlightAlertsCard() {
  const { prefs, loading, update } = useUserPreferences();
  const { user } = useAuth();
  const [push, setPush] = useState<PushStatus | "checking">("checking");
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    if (!pushSupported()) {
      setPush("unsupported");
      return;
    }
    setPush(await getStatus());
  }, []);
  useEffect(() => {
    void read();
  }, [read]);

  const set = async (patch: { proactive_awareness_enabled?: boolean; telegram_awareness_enabled?: boolean }) => {
    await update(patch);
    vantaToast.success("Saved. Echo will speak up on that channel.");
  };

  /* This phone can only be registered on the real address, in its own window. */
  const canRegisterHere = pushSupported() && swAllowedHere();

  const turnOnPush = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const r = await subscribeToPush(user.id);
      if (r.ok) {
        vantaToast.success("This phone is registered. A gate change reaches it first.");
      } else if (r.status === "blocked") {
        vantaToast.warning("Your phone is blocking notifications for Metro Echo. That switch lives in phone settings.");
      } else if (r.status === "needs-config") {
        vantaToast.warning("Push is not configured on the server yet.");
      } else if (r.status === "unsupported") {
        vantaToast.warning("This browser cannot take push. On iPhone, install Metro Echo first.");
      } else {
        vantaToast.warning("That did not register. You can try again.");
      }
      await read();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="vanta-card space-y-3 p-3">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" aria-hidden />
        <p className="vanta-machine-label text-foreground/70">When a flight changes</p>
      </div>

      <label className="flex items-start justify-between gap-3">
        <span className="space-y-0.5">
          <span className="block text-[13px] text-foreground">Say it in Today</span>
          <span className="block text-[11.5px] text-muted-foreground">
            A gate change, a delay of half an hour or more, a cancellation or a diversion lands in Today on its own.
          </span>
        </span>
        <Switch
          checked={prefs.proactive_awareness_enabled}
          disabled={loading}
          onCheckedChange={(v) => void set({ proactive_awareness_enabled: v })}
          aria-label="Say flight changes in Today"
        />
      </label>

      {/* This phone, first. A registered device beats chat on the same change. */}
      <div className="flex items-start justify-between gap-3">
        <span className="space-y-0.5">
          <span className="block text-[13px] text-foreground">Alert this phone</span>
          <span className="block text-[11.5px] text-muted-foreground">
            {push === "ready"
              ? "Registered. A gate change, a delay or a landing reaches this phone before the screen moves."
              : push === "blocked"
                ? "Your phone is blocking notifications for Metro Echo. That switch lives in phone settings."
                : push === "unsupported"
                  ? "This browser cannot take push. On iPhone, install Metro Echo first, then come back."
                  : !canRegisterHere
                    ? "A preview window cannot register a phone. Open metroecho.lovable.app on the phone itself."
                    : "Not registered yet. One tap and a gate change reaches this phone first."}
          </span>
        </span>
        {push === "checking" ? (
          <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        ) : push === "ready" ? (
          <span className="mt-0.5 shrink-0 text-[11px] text-primary">On</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-[11.5px]"
            disabled={busy || !canRegisterHere || push === "blocked" || push === "unsupported"}
            onClick={() => void turnOnPush()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Turn on"}
          </Button>
        )}
      </div>

      <label className="flex items-start justify-between gap-3">
        <span className="space-y-0.5">
          <span className="block text-[13px] text-foreground">Send it to my chat too</span>
          <span className="block text-[11.5px] text-muted-foreground">
            The fallback when no phone is registered. Quiet hours hold everything except a cancellation or a diversion.
          </span>
        </span>
        <Switch
          checked={prefs.telegram_awareness_enabled}
          disabled={loading || !prefs.proactive_awareness_enabled}
          onCheckedChange={(v) => void set({ telegram_awareness_enabled: v })}
          aria-label="Send flight changes to my chat too"
        />
      </label>

      <p className="text-[11px] text-muted-foreground/80">
        One change, one notice, on one surface. Echo tells you what changed and leaves a receipt. Dropping, rebooking or
        paying for anything still happens here, by your hand.
      </p>
    </Card>
  );
}
