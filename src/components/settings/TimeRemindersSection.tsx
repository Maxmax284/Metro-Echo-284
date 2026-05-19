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
            Tell Vanta when "tonight" means 7 PM, and which timezone is real.
          </p>
        </div>
      </div>

      {drifted && (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-warn/10 px-2.5 py-2 text-[11.5px] ring-1 ring-warn/30 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            <div>
              <div className="text-foreground">
                Your device says <strong>{browserTimezone}</strong>, but Vanta is set to <strong>{storedTimezone}</strong>.
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

        {/* Quiet hours */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <BellOff className="h-3 w-3" /> Quiet hours
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Low-priority reminders stay silent in this window.
          </p>
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
            <li className="flex items-start justify-between gap-3 py-2 opacity-80">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Bell className="h-3 w-3" /> Push
                  <span className="rounded-full bg-muted/30 px-1.5 py-0 text-[9px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/50">
                    soon
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">Browser / PWA push — opt-in only.</div>
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
