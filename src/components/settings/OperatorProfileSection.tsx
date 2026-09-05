import { useEffect, useState } from "react";
import { UserCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIntakePrefs } from "@/hooks/useIntakePrefs";
import { useSherlockSettings } from "@/hooks/useSherlockSettings";

/**
 * Operator Profile — Phase 2 (read-only).
 *
 * Assembles "what Echo knows about you" strictly from preferences you have
 * already approved by using the app. No inference, no new tables, no silent
 * writes. Each trait shows: what / source / where to change it.
 *
 * See .lovable/companion-intelligence-audit.md for the full design.
 */

type Trait = {
  kind: string;
  label: string;
  value: string;
  source: string;
  manage: string;
};

export function OperatorProfileSection() {
  const { user } = useAuth();
  const { prefs, loading: prefsLoading } = useUserPreferences();
  const { intake, loading: intakeLoading } = useIntakePrefs();
  const { settings: sherlock, loading: sherlockLoading } = useSherlockSettings();
  const [channels, setChannels] = useState<
    { channel: string; default_route: string | null; status: string }[]
  >([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setChannelsLoading(true);
    supabase
      .from("user_channel_links")
      .select("channel, default_route, status")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setChannels((data ?? []) as any);
        setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loading =
    prefsLoading || intakeLoading || sherlockLoading || channelsLoading;
  if (loading) return null;

  const traits: Trait[] = [];

  // Time & timezone
  if (prefs.timezone) {
    traits.push({
      kind: "Time",
      label: "Timezone",
      value: prefs.timezone,
      source: prefs.auto_detect_timezone ? "Auto-detected, you confirmed" : "You set this",
      manage: "Time & Reminders",
    });
  }
  traits.push({
    kind: "Time",
    label: "Default reminder windows",
    value: `morning ${prefs.default_morning_time} · afternoon ${prefs.default_afternoon_time} · evening ${prefs.default_evening_time}`,
    source: "You set this",
    manage: "Time & Reminders",
  });
  traits.push({
    kind: "Time",
    label: "Quiet hours",
    value: `${prefs.quiet_hours_start} → ${prefs.quiet_hours_end}`,
    source: "You set this",
    manage: "Time & Reminders",
  });

  // Reminder channels
  const reminderChans = [
    prefs.in_app_reminders_enabled && "in-app",
    prefs.push_reminders_enabled && "push",
    prefs.telegram_reminders_enabled && "Telegram",
  ].filter(Boolean) as string[];
  traits.push({
    kind: "Reminders",
    label: "Where you want to be nudged",
    value: reminderChans.length ? reminderChans.join(", ") : "none",
    source: "You toggled this",
    manage: "Time & Reminders",
  });

  // Routing — channels
  for (const c of channels) {
    if (c.status !== "linked") continue;
    traits.push({
      kind: "Routing",
      label: `${c.channel} default route`,
      value: c.default_route ?? "inbox",
      source: "You linked this channel",
      manage: "Platform Integrations",
    });
  }

  // Intake / attention preferences
  traits.push({
    kind: "Attention",
    label: "Hide loose captures after",
    value: `${intake.capture_visibility_days} days`,
    source: "You set this",
    manage: "Inbox & Command Center cleanup",
  });
  traits.push({
    kind: "Attention",
    label: "Stale unattached items",
    value: intake.unattached_after_window,
    source: "You set this",
    manage: "Inbox & Command Center cleanup",
  });
  traits.push({
    kind: "Attention",
    label: "Dismissed items",
    value:
      intake.dismissed_behavior === "sticky"
        ? "stay hidden until restored"
        : "show small restore button",
    source: "You set this",
    manage: "Inbox & Command Center cleanup",
  });
  traits.push({
    kind: "Attention",
    label: "Duplicates",
    value: intake.duplicate_grouping.replace("_", " "),
    source: "You set this",
    manage: "Inbox & Command Center cleanup",
  });

  // Ambient recognition
  if (sherlock) {
    traits.push({
      kind: "Recognition",
      label: "Ambient recognition",
      value: sherlock.ambient_enabled ? "on" : "off",
      source: "You toggled this",
      manage: "Recognize panel / Memory",
    });
    traits.push({
      kind: "Recognition",
      label: "Sensitive items",
      value: sherlock.manual_only_for_sensitive
        ? "manual review only"
        : "automatic suggestions allowed",
      source: "You toggled this",
      manage: "Recognize panel / Memory",
    });
  }

  const groups = Array.from(new Set(traits.map((t) => t.kind)));

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <UserCircle2 className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What Echo knows about you</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Read-only view. Every line below comes from a preference you already
            approved. Nothing is inferred, nothing is silent. Change or remove
            anything in the section listed under "Manage".
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md bg-background/40 p-2.5 ring-1 ring-border/40">
        <Info className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11.5px] text-muted-foreground">
          Phase 2 of the Companion Intelligence rollout: surface what already
          exists. Suggested traits with approval chips arrive in Phase 3.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {g}
            </div>
            <ul className="divide-y divide-border/40 rounded-lg ring-1 ring-border/40">
              {traits
                .filter((t) => t.kind === g)
                .map((t, i) => (
                  <li key={`${g}-${i}`} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-[12px] font-medium">{t.label}</div>
                      <div className="text-[11.5px] text-foreground/90">{t.value}</div>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                      <span>Source: {t.source}</span>
                      <span aria-hidden>·</span>
                      <span>Manage in: {t.manage}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
