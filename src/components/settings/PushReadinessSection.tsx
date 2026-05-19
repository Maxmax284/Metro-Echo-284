import { useEffect, useState } from "react";
import { Bell, BellOff, ShieldAlert, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { getStatus, pushSupported, subscribeToPush, unsubscribeFromPush, type PushStatus } from "@/lib/pushClient";

/**
 * Push readiness — live delivery via VAPID Web Push.
 * Permission requested only on explicit tap. Audit every transition.
 */
export function PushReadinessSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => { detect(); }, []);

  async function detect() {
    if (!pushSupported()) return setStatus("unsupported");
    const s = await getStatus();
    setStatus(s);
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
    if (!user) return;
    setBusy(true);
    await audit("push.permission_requested");
    try {
      const r = await subscribeToPush(user.id);
      setStatus(r.status);
      if (r.ok) {
        await audit("push.permission_granted");
        toast.success("Push is ready. You'll get reminders here too.");
      } else if (r.status === "blocked") {
        await audit("push.permission_denied");
        toast("Your browser blocked notifications. Change that in browser settings.");
      } else if (r.status === "needs-config") {
        toast("Push isn't configured on the server yet.");
      } else if (r.status === "unsupported") {
        toast("Push isn't supported in this browser.");
      } else {
        toast("Push wasn't enabled. You can try again.");
      }
    } catch (e) {
      toast("Couldn't enable push. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await unsubscribeFromPush(user.id);
      setStatus("off");
      toast("Push turned off. Telegram and in-app still work.");
    } finally {
      setBusy(false);
    }
  const sendTest = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-test");
      if (error) throw error;
      const d = (data ?? {}) as { sent?: number; failed?: number; expired?: number; reason?: string };
      if (d.reason === "no_subscriptions") {
        toast("No active subscriptions on this account. Enable push first.");
      } else if (d.sent && d.sent > 0) {
        toast.success(`Test push sent to ${d.sent} device${d.sent === 1 ? "" : "s"}. Watch for it.`);
      } else {
        toast("Sent — but nothing delivered. Check Audit for details.");
      }
    } catch (e: any) {
      toast(e?.message || "Test push failed.");
    } finally {
      setBusy(false);
    }
  };



  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/15 p-2 ring-1 ring-primary/30">
          {status === "ready" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Push notifications</h2>
            <span className={
              "rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ring-1 " +
              (status === "ready"
                ? "bg-primary/15 text-primary ring-primary/30"
                : "bg-muted/30 text-muted-foreground ring-border/50")
            }>
              {status === "ready" ? "Live" : status === "needs-config" ? "Setup needed" : status === "blocked" ? "Blocked" : "Off"}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">Browser / PWA push for reminders. Respects quiet hours.</p>
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
            Your browser blocked notifications. Change that in browser settings, then come back.
          </Hint>
        )}
        {status === "needs-config" && (
          <Hint icon={<ShieldAlert className="h-4 w-4 text-warn" />}>
            Push isn't configured on the server yet. Once VAPID keys are set, this will go live.
          </Hint>
        )}
        {status === "off" && (
          <Button size="lg" className="w-full gap-2" disabled={busy} onClick={enable}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Enable push reminders
          </Button>
        )}
        {status === "ready" && (
          <div className="space-y-2">
            <Hint icon={<Bell className="h-4 w-4 text-emerald-300" />}>
              You're subscribed. Reminders fire to this device. Receipts land in Audit.
            </Hint>
            <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={disable}>
              Turn off on this device
            </Button>
          </div>
        )}
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
