// ProactiveAwarenessSection — whether Echo may speak up on its own, and how far.
//
// Lives under Your awareness: this is a noticing control, not a time control.
// Every switch here stays inside the doctrine — drafts only, quiet hours hold,
// nothing is staged, approved or run for you.
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { Radar } from "lucide-react";

export function ProactiveAwarenessSection() {
  const { user } = useAuth();
  const { prefs, update, loading } = useUserPreferences();

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

  if (loading) {
    return (
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <p className="text-[12px] text-muted-foreground">Loading awareness settings…</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <Radar className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Proactive awareness</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Whether Echo may raise a quiet note in Today without being asked first.
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-start justify-between gap-3 py-2">
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
        <p className="mt-2 text-[11px] text-muted-foreground">
          Quiet hours, channels and test sends live under <strong>Notifications</strong> in the Control Room.
        </p>
      </div>
    </section>
  );
}
