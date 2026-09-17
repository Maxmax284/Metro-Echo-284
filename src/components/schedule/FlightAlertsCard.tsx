// FlightAlertsCard — turning on "tell me when my flight changes" without going
// anywhere near Telegram setup.
//
// Doctrine:
//   - Two separate switches. Notes in Today are one thing; a message on your
//     phone is another, and neither is assumed.
//   - Honest about the edges: quiet hours hold everything but a cancellation or
//     a diversion, and nothing here approves anything.
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { vantaToast } from "@/lib/vantaVoice";

export function FlightAlertsCard() {
  const { prefs, loading, update } = useUserPreferences();

  const set = async (patch: { proactive_awareness_enabled?: boolean; telegram_awareness_enabled?: boolean }) => {
    await update(patch);
    vantaToast.success("Saved. Echo will speak up on that channel.");
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

      <label className="flex items-start justify-between gap-3">
        <span className="space-y-0.5">
          <span className="block text-[13px] text-foreground">Also ping my phone</span>
          <span className="block text-[11.5px] text-muted-foreground">
            Only works once a chat is linked. Quiet hours hold everything except a cancellation or a diversion.
          </span>
        </span>
        <Switch
          checked={prefs.telegram_awareness_enabled}
          disabled={loading || !prefs.proactive_awareness_enabled}
          onCheckedChange={(v) => void set({ telegram_awareness_enabled: v })}
          aria-label="Also ping my phone about flight changes"
        />
      </label>

      <p className="text-[11px] text-muted-foreground/80">
        Echo tells you what changed and leaves a receipt. Dropping, rebooking or paying for anything still happens here,
        by your hand.
      </p>
    </Card>
  );
}
