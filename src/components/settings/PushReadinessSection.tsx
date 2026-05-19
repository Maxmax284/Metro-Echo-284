import { useEffect, useState } from "react";
import { Bell, BellOff, ShieldAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";

type Status = "supported" | "unsupported" | "blocked" | "off" | "on";

/**
 * Push readiness — staged delivery. No service worker is registered yet.
 * Permission is requested only on explicit tap. Audit every transition.
 */
export function PushReadinessSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => { detect(); }, []);

  function detect() {
    if (typeof window === "undefined") return;
    const supports = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supports) return setStatus("unsupported");
    const perm = Notification.permission;
    if (perm === "denied") return setStatus("blocked");
    if (perm === "granted") return setStatus("on");
    return setStatus("off");
  }

  const audit = async (event: string, payload: Record<string, any> = {}) => {
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "push",
      event,
      payload,
    });
  };

  const enable = async () => {
    if (!("Notification" in window)) return;
    setBusy(true);
    await audit("push.permission_requested");
    try {
      const r = await Notification.requestPermission();
      if (r === "granted") {
        setStatus("on");
        await audit("push.permission_granted");
        toast.success("Push is ready. Delivery is still staged — we'll turn it on once verified.");
      } else if (r === "denied") {
        setStatus("blocked");
        await audit("push.permission_denied");
        toast("Your browser blocked notifications. You can change that in browser settings.");
      } else {
        setStatus("off");
        toast("No problem — you can enable push later.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/15 p-2 ring-1 ring-primary/30">
          {status === "on" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Push notifications</h2>
          <p className="text-[12px] text-muted-foreground">Browser push for reminders. Delivery is staged — permission only, no spam.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-[12px]">
        {status === "unsupported" && (
          <Hint icon={<Info className="h-4 w-4" />}>
            Push reminders aren't supported in this browser. iOS Safari supports it only when Vanta is installed to the home screen.
          </Hint>
        )}
        {status === "blocked" && (
          <Hint icon={<ShieldAlert className="h-4 w-4 text-warn" />}>
            Your browser blocked notifications. You can change that in browser settings, then come back.
          </Hint>
        )}
        {status === "off" && (
          <Button size="lg" className="w-full gap-2" disabled={busy} onClick={enable}>
            <Bell className="h-4 w-4" /> Enable push reminders
          </Button>
        )}
        {status === "on" && (
          <Hint icon={<Bell className="h-4 w-4 text-emerald-300" />}>
            Permission granted. Push delivery is staged — we'll turn it on once the worker is verified. You'll see receipts in Audit.
          </Hint>
        )}
        <p className="text-[11px] italic text-muted-foreground">
          Telegram delivery is the live channel right now. Toggle it in Time & Reminders.
        </p>
      </div>
    </section>
  );
}

function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/40 p-3 ring-1 ring-border/60">
      <span className="mt-0.5 text-foreground/70">{icon}</span>
      <div className="text-[12px] text-muted-foreground">{children}</div>
    </div>
  );
}
