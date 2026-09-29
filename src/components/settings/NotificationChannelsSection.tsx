import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, MessageSquare } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

/**
 * Quiet hours and the channels Echo may use. One home — the ladder above
 * shows the result of these choices.
 */
export function NotificationChannelsSection() {
  const { user } = useAuth();
  const { prefs, update, loading } = useUserPreferences();
  const [tgStatus, setTgStatus] = useState<{ lastSent: string | null; skipped: number; failed: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const audit = async (event: string, payload: Record<string, any> = {}) => {
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "profile",
      entity_id: user.id,
      event,
      payload,
    });
  };

  /** Send a realistic sample notice to the linked chat and report plainly. */
  const sendTelegramTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-test", {
        body: { sample: "camp_state" },
      });
      if (error) {
        setTestResult("Couldn't send — the delivery service returned an error.");
        toast.error({ title: "Test send failed" });
        return;
      }
      const res = (data ?? {}) as {
        sent?: number;
        failed?: number;
        reason?: string;
        errors?: string[];
        receipts?: { message_id?: number }[];
      };
      if (res.reason === "no_links") {
        setTestResult("No Telegram chat is linked yet. Link your chat first, then test again.");
        return;
      }
      if ((res.sent ?? 0) > 0) {
        const id = res.receipts?.[0]?.message_id;
        setTestResult(
          id
            ? `Delivered — Telegram confirmed message #${id}. It's formatted like a real notice.`
            : "Delivered. Check Telegram — it's formatted like a real notice.",
        );
        toast.success({ title: "Test notice delivered" });
        return;
      }
      setTestResult(res.errors?.[0] ? `Couldn't send: ${res.errors[0]}` : "Couldn't send — nothing was delivered.");
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setTesting(false);
      await audit("telegram.test_requested", { sample: "camp_state" });
    }
  };

  // Last 7 days of Telegram delivery audit, so the toggle shows real outcomes.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("audit_log")
        .select("event, created_at")
        .eq("user_id", user.id)
        .like("event", "reminder.telegram_%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = data ?? [];
      const lastSent = rows.find((r: any) => r.event === "reminder.telegram_sent")?.created_at ?? null;
      const skipped = rows.filter((r: any) => r.event === "reminder.telegram_skipped_quiet_hours").length;
      const failed = rows.filter((r: any) => r.event === "reminder.telegram_failed").length;
      setTgStatus({ lastSent, skipped, failed });
    })();
  }, [user, prefs.telegram_reminders_enabled]);

  if (loading) {
    return (
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <p className="text-[12px] text-muted-foreground">Loading notification settings…</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <BellOff className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Quiet hours and channels</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Inside quiet hours only critical news punches through. Everything else waits for morning.
          </p>
        </div>
      </div>

      {/* Quiet hours */}
      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Quiet hours
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-muted-foreground">
            Start
            <Input
              type="time"
              value={prefs.quiet_hours_start}
              onChange={(e) => update({ quiet_hours_start: e.target.value })}
              onBlur={() => audit("preferences.updated", { field: "quiet_hours_start", value: prefs.quiet_hours_start })}
              className="mt-1 h-8 text-[12px]"
            />
          </label>
          <label className="block text-[11px] text-muted-foreground">
            End
            <Input
              type="time"
              value={prefs.quiet_hours_end}
              onChange={(e) => update({ quiet_hours_end: e.target.value })}
              onBlur={() => audit("preferences.updated", { field: "quiet_hours_end", value: prefs.quiet_hours_end })}
              className="mt-1 h-8 text-[12px]"
            />
          </label>
        </div>
      </div>

      {/* Channels */}
      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Channels
        </label>
        <ul className="mt-1.5 divide-y divide-border/40">
          <li className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Bell className="h-3 w-3 text-primary" /> In-app
              </div>
              <div className="text-[11px] text-muted-foreground">Always on. Shows in Today and Work.</div>
            </div>
            <Switch checked disabled />
          </li>
          <li className="py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <MessageSquare className="h-3 w-3" /> Telegram
                  <span className={cn(
                    "rounded-full px-1.5 py-0 text-[9px] uppercase tracking-wider ring-1",
                    prefs.telegram_reminders_enabled
                      ? "bg-primary/15 text-primary ring-primary/30"
                      : "bg-muted/30 text-muted-foreground ring-border/50",
                  )}>
                    {prefs.telegram_reminders_enabled ? "live" : "off"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Nudges through your linked chat when the phone can't be reached. Respects quiet hours.
                </div>
              </div>
              <Switch
                checked={!!prefs.telegram_reminders_enabled}
                onCheckedChange={(v) => {
                  update({ telegram_reminders_enabled: v });
                  audit("preferences.updated", { field: "telegram_reminders_enabled", value: v });
                }}
              />
            </div>
            {prefs.telegram_reminders_enabled && tgStatus && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="rounded-full bg-background/40 px-2 py-0.5 ring-1 ring-border/60">
                  {tgStatus.lastSent
                    ? `Last sent ${formatDistanceToNow(new Date(tgStatus.lastSent), { addSuffix: true })}`
                    : "No reminders sent yet"}
                </span>
                {tgStatus.skipped > 0 && (
                  <span className="rounded-full bg-background/40 px-2 py-0.5 ring-1 ring-border/60">
                    Quiet hours blocked {tgStatus.skipped}
                  </span>
                )}
                {tgStatus.failed > 0 && (
                  <span className="rounded-full bg-warn/10 px-2 py-0.5 text-warn ring-1 ring-warn/30">
                    Failed {tgStatus.failed}
                  </span>
                )}
              </div>
            )}
            {prefs.telegram_reminders_enabled && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-h-[44px] gap-1.5 text-xs sm:min-h-0"
                  disabled={testing}
                  onClick={sendTelegramTest}
                >
                  <MessageSquare className="h-3 w-3" />
                  {testing ? "Sending…" : "Send test message"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {testResult ?? "Sends a sample notice to your linked chat so you can check the wording."}
                </span>
              </div>
            )}
          </li>
          <li className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Bell className="h-3 w-3" /> Push
                <span className={cn(
                  "rounded-full px-1.5 py-0 text-[9px] uppercase tracking-wider ring-1",
                  prefs.push_reminders_enabled
                    ? "bg-primary/15 text-primary ring-primary/30"
                    : "bg-muted/30 text-muted-foreground ring-border/50",
                )}>
                  {prefs.push_reminders_enabled ? "on" : "off"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Browser / PWA push. Device setup lives in the panel above.
              </div>
            </div>
            <Switch
              checked={!!prefs.push_reminders_enabled}
              onCheckedChange={(v) => {
                update({ push_reminders_enabled: v });
                audit("preferences.updated", { field: "push_reminders_enabled", value: v });
              }}
            />
          </li>
        </ul>
      </div>
    </section>
  );
}
