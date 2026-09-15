// RemindMeButton — one tap that says "this one counts".
//
// No new surface, no new engine: it opens or closes the same watch object the
// reminder engine already treats as explicit intent.
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { Bell, BellRing } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { startReminder, stopReminder, watchSubjectFor } from "@/lib/remindMe";

type Props = {
  event: { id: string; uid?: string | null; title: string | null; starts_at: string };
  reminded: boolean;
  onChanged: () => void;
};

export function RemindMeButton({ event, reminded, onChanged }: Props) {
  const { user } = useAuth();
  const { orgId } = useScope();
  const [busy, setBusy] = useState(false);
  const name = event.title?.trim() || "this entry";

  const toggle = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (reminded) {
        await stopReminder(watchSubjectFor(event));
        toast.success("Echo will leave that one alone.");
      } else {
        await startReminder({ userId: user.id, organizationId: orgId || null, event });
        toast.success("Echo will say something the evening before, and again on the day.");
      }
      onChanged();
    } catch {
      toast.error("That would not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={reminded}
      aria-label={reminded ? `Stop reminding me about ${name}` : `Remind me about ${name}`}
      className={`min-h-[44px] shrink-0 px-2 ${
        reminded ? "text-primary" : "text-muted-foreground hover:text-primary"
      }`}
      onClick={() => void toggle()}
    >
      {reminded ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
    </button>
  );
}
