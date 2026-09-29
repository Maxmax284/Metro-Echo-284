import { useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Clock, Globe, AlertTriangle } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

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
 * Time — timezone and default times. Quiet hours and channels live under
 * Notifications; proactive awareness under Your awareness.
 * Persists to profiles.timezone + profiles.preferences. All changes audited.
 */
export function TimeRemindersSection() {
  const { user } = useAuth();
  const { prefs, update, loading } = useUserPreferences();
  const { browserTimezone, storedTimezone, drifted } = useUserTimezone();
  const [tzQuery, setTzQuery] = useState("");

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

        <p className="text-[11px] text-muted-foreground">
          Quiet hours and channels live under <strong>Notifications</strong>; proactive awareness under{" "}
          <strong>Your awareness</strong> — both in the Control Room.
        </p>
      </div>
    </section>
  );
}
