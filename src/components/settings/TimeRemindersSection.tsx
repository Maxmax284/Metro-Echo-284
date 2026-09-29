import { useEffect, useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Clock, Globe, BellOff, MessageSquare, Bell, AlertTriangle } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const COMMON_TZ = [
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

/**
 * Time & Reminders — timezone, default times, quiet hours, delivery preferences.
 * Persists to profiles.timezone + profiles.preferences. All changes audited.
 */
export function TimeRemindersSection() {
  const { user } = useAuth();
  const { prefs, update, loading } = useUserPreferences();
  const { browserTimezone, storedTimezone, drifted } = useUserTimezone();
  const [tzQuery, setTzQuery] = useState("");
  const [tgStatus, setTgStatus] = useState<{ lastSent: string | null; skipped: number; failed: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

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


  // Pull last 7 days of Telegram delivery audit so the user can see what's actually happening.
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

  const setTz = async (tz: string, autodetect = false) => {
    await update({ timezone: tz });
    await audit(autodetect ? "timezone.autodetected" : "timezone.updated", { timezone: tz });
    toast.success({ title: vantaSay.timezoneUpdated(tz) });
  };

  const filteredTz = COMMON_TZ.filter((tz) =>
    tz.toLowerCase().includes(tzQuery.trim().toLowerCase()),
  );

  if (loading) {
    return (
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <p className="text-[12px] text-muted-foreground">Loading time settings…</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Time & Reminders</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Tell Echo when "tonight" means 7 PM, and which timezone is real.
          </p>
        </div>
      </div>

      {drifted && (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-warn/10 px-2.5 py-2 text-[11.5px] ring-1 ring-warn/30 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            <div>
              <div className="text-foreground">
                Your device says <strong>{browserTimezone}</strong>, but Echo is set to <strong>{storedTimezone}</strong>.
              </div>
              <div className="text-muted-foreground">Pick one so reminders fire correctly.</div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 whitespace-nowrap px-2 text-[11px]"
              onClick={() => setTz(browserTimezone, true)}
            >
              Use device
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 whitespace-nowrap px-2 text-[11px]"
              onClick={() => audit("timezone.drift_dismissed", { stored: storedTimezone, browser: browserTimezone })}
            >
              Keep saved
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* Timezone */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> Timezone
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[12px] text-primary ring-1 ring-primary/30">
              {prefs.timezone ?? browserTimezone}
            </span>
            {!prefs.timezone && (
              <span className="text-[11px] italic text-muted-foreground">
                No timezone saved — defaulting to device.
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => setTz(browserTimezone, true)}
            >
              Auto-detect ({browserTimezone})
            </Button>
          </div>
          <Input
            placeholder="Search a timezone…"
            value={tzQuery}
            onChange={(e) => setTzQuery(e.target.value)}
            className="mt-2 h-8 text-[12px]"
          />
          <div className="mt-1.5 grid grid-cols-2 gap-1 md:grid-cols-3">
            {filteredTz.map((tz) => (
              <button
                key={tz}
                onClick={() => setTz(tz)}
                className={cn(
                  "rounded-md px-2 py-1 text-left text-[11.5px] ring-1 transition-colors",
                  prefs.timezone === tz
                    ? "bg-primary/15 text-primary ring-primary/40"
                    : "bg-background/40 text-muted-foreground ring-border/60 hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                {tz}
              </button>
            ))}
            {filteredTz.length === 0 && (
              <span className="col-span-full text-[11px] italic text-muted-foreground">
                No match. Try a city or region.
              </span>
            )}
          </div>
        </div>

        {/* Default times */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            What morning, afternoon, evening mean to you
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Used when a reminder is vague ("tonight", "tomorrow morning").
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {([
              ["default_morning_time", "Morning"],
              ["default_afternoon_time", "Afternoon"],
              ["default_evening_time", "Evening / tonight"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block text-[11px] text-muted-foreground">
                {label}
                <Input
                  type="time"
                  value={(prefs as any)[key]}
                  onChange={(e) => update({ [key]: e.target.value } as any)}
                  onBlur={() => audit("preferences.updated", { field: key, value: (prefs as any)[key] })}
                  className="mt-1 h-8 text-[12px]"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Proactive awareness */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Proactive awareness
          </label>
          <div className="mt-1.5 flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium">Let Echo speak up on its own</div>
              <div className="text-[11px] text-muted-foreground">
                Off by default. When on, Echo raises at most one quiet note in Today when a project goes silent, a
                promise keeps slipping, a flagged risk sits unread, or a real appointment is coming.
                It stays a draft — nothing is staged, approved or run for you, and nothing arrives during quiet hours.
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                Appointments: one calm heads-up the evening before, one a few hours out on the day, plus anything that
                moves or collides. Holds, busy blocks and birthdays stay silent unless you asked Echo to keep an eye on
                one. This is Echo's own read of your calendar, not a copy of Google's alarms — those keep firing on their
                own.
              </div>
            </div>
            <Switch
              checked={!!prefs.proactive_awareness_enabled}
              onCheckedChange={(v) => {
                update({ proactive_awareness_enabled: v });
                audit("preferences.updated", { field: "proactive_awareness_enabled", value: v });
              }}
            />
          </div>
          {prefs.proactive_awareness_enabled && (
            <div className="mt-1 flex items-start justify-between gap-3 border-t border-border/40 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">Watch quietly first (shadow mode)</div>
                <div className="text-[11px] text-muted-foreground">
                  Echo runs the full check and keeps the reasoning in Receipts, but says nothing in Today. Use it for a
                  few days to see what it would have raised before letting it speak.
                </div>
              </div>
              <Switch
                checked={!!prefs.awareness_shadow_mode}
                onCheckedChange={(v) => {
                  update({ awareness_shadow_mode: v });
                  audit("preferences.updated", { field: "awareness_shadow_mode", value: v });
                }}
              />
            </div>
          )}
          {prefs.proactive_awareness_enabled && (
            <div className="mt-1 flex items-start justify-between gap-3 border-t border-border/40 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">Let Google keep the day-of alarm</div>
                <div className="text-[11px] text-muted-foreground">
                  On by default. Google already buzzes you before an appointment starts, so Echo stays out of that lane
                  and only says what Google never says: what tomorrow looks like, a time that moved, a collision.
                  Turn it off if you want Echo's own heads-up on the day too. Anything you asked Echo to keep an eye on
                  always speaks, either way.
                </div>
              </div>
              <Switch
                checked={prefs.calendar_defer_to_google !== false}
                onCheckedChange={(v) => {
                  update({ calendar_defer_to_google: v });
                  audit("preferences.updated", { field: "calendar_defer_to_google", value: v });
                }}
              />
            </div>
          )}
          {prefs.proactive_awareness_enabled && !prefs.awareness_shadow_mode && (
            <div className="mt-1 flex items-start justify-between gap-3 border-t border-border/40 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">Reach me on Telegram when it's time-sensitive</div>
                <div className="text-[11px] text-muted-foreground">
                  Only for notes Echo considers time-sensitive, and only if your chat is linked. The message tells you
                  what changed and where to look — you still approve and run everything inside Metro Echo.
                </div>
              </div>
              <Switch
                checked={!!prefs.telegram_awareness_enabled}
                onCheckedChange={(v) => {
                  update({ telegram_awareness_enabled: v });
                  audit("preferences.updated", { field: "telegram_awareness_enabled", value: v });
                }}
              />
            </div>
          )}
          {prefs.proactive_awareness_enabled && !prefs.awareness_shadow_mode && (
            <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border/40 py-2">
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
                {testResult ?? "Sends a sample LMT Camp State notice so you can check the wording."}
              </span>
            </div>
          )}

        </div>




        {/* Delivery */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Delivery
          </label>
          <ul className="mt-1.5 divide-y divide-border/40">
            <li className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Bell className="h-3 w-3 text-primary" /> In-app
                </div>
                <div className="text-[11px] text-muted-foreground">Always on. Shows in Cockpit and Commitments.</div>
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
                  <div className="text-[11px] text-muted-foreground">Reminder nudges through your linked chat. Respects quiet hours.</div>
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
                <div className="text-[11px] text-muted-foreground">Browser / PWA push. Enable per device above.</div>
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
      </div>
    </section>
  );
}
