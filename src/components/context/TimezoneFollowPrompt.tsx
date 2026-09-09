// TimezoneFollowPrompt — the one place Echo notices you crossed a zone.
//
// The stored timezone in Settings used to win forever, so a flight changed the
// map and nothing else: the day line, the due times and the reminders all stayed
// on the old clock. Echo now says what your phone says and offers the switch.
// It never moves the clock on its own — a wrong silent change would move every
// deadline you own.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { Clock } from "lucide-react";

const cityOf = (tz: string) => (tz.split("/").pop() ?? tz).replace(/_/g, " ");

export function TimezoneFollowPrompt({
  storedTimezone,
  browserTimezone,
  onChanged,
}: {
  storedTimezone: string;
  browserTimezone: string;
  onChanged?: (tz: string) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem(`tz-prompt-dismissed:${browserTimezone}`) === "1",
  );

  if (hidden || !user) return null;

  const dismiss = () => {
    sessionStorage.setItem(`tz-prompt-dismissed:${browserTimezone}`, "1");
    setHidden(true);
  };

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ timezone: browserTimezone })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("That didn't save. Your clock is still on the old zone.");
      return;
    }
    toast.success(`Clock moved to ${cityOf(browserTimezone)} time.`);
    onChanged?.(browserTimezone);
    setHidden(true);
  };

  return (
    <div className="vanta-card mt-3 rounded-xl p-3">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-snug text-foreground">
            Your phone says {cityOf(browserTimezone)}. Echo is still keeping time in{" "}
            {cityOf(storedTimezone)}.
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Switching moves every time you see here — due times, reminders, the day line.
            Nothing changes until you say so.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="h-8" disabled={busy} onClick={accept}>
              Use {cityOf(browserTimezone)} time
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={dismiss}>
              Stay on {cityOf(storedTimezone)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
