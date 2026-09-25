import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { getStatus, pushSupported, subscribeToPush, swAllowedHere } from "@/lib/pushClient";

const DISMISS_KEY = "vanta.push.prompt.dismissed";

/**
 * One tap to put today's agenda and promises on this phone's lock screen.
 * Opt-in only: nothing subscribes without this press. Hidden once the device is
 * already subscribed, once it can't be (preview origin, unsupported browser),
 * or once the person waves it away.
 */
export function PushPrompt({ className }: { className?: string }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) return;
      if (typeof window === "undefined") return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (!pushSupported() || !swAllowedHere()) return;
      const status = await getStatus();
      if (alive && status === "off") setShow(true);
    })();
    return () => { alive = false; };
  }, [user]);

  if (!show) return null;

  const enable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const r = await subscribeToPush(user.id);
      if (r.ok) {
        toast.success("This phone will get today's reminders.");
        setShow(false);
      } else if (r.status === "blocked") {
        toast("Your phone blocked notifications for Metro Echo. Allow them in browser settings.");
        setShow(false);
      } else if (r.status === "needs-config") {
        toast("Notifications aren't set up on the server yet.");
      } else {
        toast("That didn't take. You can try again.");
      }
    } catch {
      toast("That didn't take. You can try again.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div className={`vanta-card relative flex items-start gap-3 p-3 ${className ?? ""}`}>
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Reminders on this phone</div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Today's agenda, promises coming due and a moved flight reach you on the lock screen. Tapping one opens
          the exact item here. Nothing is sent or approved for you.
        </p>
        <Button size="sm" className="mt-2" onClick={enable} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Turn on for this phone
        </Button>
      </div>
      <button
        type="button"
        aria-label="Not now"
        onClick={dismiss}
        className="vanta-focus -mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
