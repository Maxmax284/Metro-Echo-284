import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type UserPreferences = {
  timezone?: string | null;
  auto_detect_timezone?: boolean;
  default_morning_time?: string;   // "08:00"
  default_afternoon_time?: string; // "14:00"
  default_evening_time?: string;   // "19:00"
  default_reminder_time?: string;  // fallback when only date given
  quiet_hours_start?: string;      // "22:00"
  quiet_hours_end?: string;        // "07:00"
  telegram_reminders_enabled?: boolean;
  push_reminders_enabled?: boolean;
  in_app_reminders_enabled?: boolean;
  proactive_awareness_enabled?: boolean;
  /** Run the full awareness check but stay silent — reasoning lands in Receipts only. */
  awareness_shadow_mode?: boolean;
  /** Let time-sensitive awareness notes reach the linked Telegram chat. */
  telegram_awareness_enabled?: boolean;
  /**
   * On (default): Google keeps the day-of alarm, Echo only says what Google
   * never says — tomorrow's shape, a moved time, a collision.
   */
  calendar_defer_to_google?: boolean;
  /** Tone applied to everything Echo says out loud. */
  brand_voice?: "neutral" | "east_coast";
  brand_voice_intensity?: 1 | 2 | 3;
  brand_voice_no_jargon?: boolean;
  /** Per-sensor consent. Absent means off. */
  sensor_consent?: Record<string, boolean>;
  /** Self-reported body context. Phrasing only — never a target or a score. */
  body_profile?: Record<string, unknown>;
  intake?: Record<string, unknown>;
  /** Border-crossing context. A country name only — never a document number. */
  entry?: {
    nationality?: string;
    /** Visiting, or living there on a lease. Phrasing only — no paperwork held. */
    stay?: "visiting" | "resident_lease";
  };
  /** Journeys you said were over. Display only — no record is removed. */
  trips_wrapped?: string[];
  /** The once-per-account welcome ran. Set once, never reset by the app. */
  intro_seen_at?: string | null;
};

const DEFAULTS: Required<Omit<UserPreferences, "timezone">> = {
  auto_detect_timezone: true,
  default_morning_time: "08:00",
  default_afternoon_time: "14:00",
  default_evening_time: "19:00",
  default_reminder_time: "09:00",
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  telegram_reminders_enabled: false,
  push_reminders_enabled: false,
  in_app_reminders_enabled: true,
  proactive_awareness_enabled: false,
  awareness_shadow_mode: true,
  telegram_awareness_enabled: false,
  calendar_defer_to_google: true,
  brand_voice: "neutral",
  brand_voice_intensity: 2,
  brand_voice_no_jargon: true,
  sensor_consent: {},
  body_profile: {},
  intake: {},
  entry: {},
  trips_wrapped: [],
  intro_seen_at: null,
};

export function useUserPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>({});
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("timezone, preferences")
      .eq("id", user.id)
      .maybeSingle();
    setTimezone(data?.timezone ?? null);
    setPrefs(((data?.preferences as UserPreferences) ?? {}) as UserPreferences);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(
    async (patch: Partial<UserPreferences> & { timezone?: string | null }) => {
      if (!user) return;
      const next = { ...prefs, ...patch };
      const { timezone: tz, ...rest } = patch;
      const profilePatch: any = { preferences: { ...prefs, ...rest } };
      if (tz !== undefined) profilePatch.timezone = tz;
      await supabase.from("profiles").update(profilePatch).eq("id", user.id);
      if (tz !== undefined) setTimezone(tz);
      setPrefs({ ...prefs, ...rest });
      return next;
    },
    [user, prefs]
  );

  const merged: Required<Omit<UserPreferences, "timezone">> & { timezone: string | null } = {
    ...DEFAULTS,
    ...prefs,
    timezone,
  };

  return { prefs: merged, loading, update, reload: load };
}

export const PREFERENCE_DEFAULTS = DEFAULTS;
